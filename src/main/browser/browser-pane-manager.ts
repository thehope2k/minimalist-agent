// Session-scoped browser pages the `browser_tool` drives via CDP, docked in
// the app's right side panel (see docs/BROWSER-PANE.md).
//
// Each chat owns one WebContentsView. Main owns every page; the renderer only
// reports where the active chat's page slot is (`setSurface`). The page whose
// chat is on screen is attached to the main window at those bounds; every
// other page is detached but keeps running, so the agent can keep working in
// background chats.

import { BaseWindow, BrowserWindow, WebContentsView, type Session } from 'electron';
import { createLogger } from '../logger';
import { getSettings } from '../storage/settings';
import {
  BrowserCDP,
  type AccessibilitySnapshot,
  type ColorScheme,
  type ConsoleLogEntry,
  type Screenshot,
  type ScreenshotOptions,
  type SnapshotOptions,
  type ViewportOverride,
} from './browser-cdp';
import { NetworkLog, type NetworkEntry, type NetworkQuery } from './browser-network-log';
import type { PageDialog } from './browser-dialogs';
import {
  HIDDEN_SURFACE,
  isAllowedNavigateUrl,
  normalizeUserUrl,
  roundBounds,
  shouldDock,
  type Surface,
} from './browser-surface';

const log = createLogger('browser-pane');

// Viewport of a page that has never been on screen.
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;
const DEFAULT_SCROLL_AMOUNT = 400;
const WAIT_POLL_MS = 250;
// No request in flight and none started/finished for this long = idle.
const NETWORK_IDLE_MS = 500;
const FREEZE_JPEG_QUALITY = 80;
// Input right after an agent command can still be the agent's own echo.
const AGENT_INPUT_GRACE_MS = 300;
// How long the activity bar keeps the last action after a command ends.
const ACTIVITY_LINGER_MS = 3_000;
// Unthrottled background pages cost CPU and memory; past this, opening one
// closes the least recently used idle page.
const MAX_OPEN_PAGES = 6;
const POPOUT_WIDTH = 1100;
const POPOUT_HEIGHT = 800;

/** App shortcuts that must still work while a page has keyboard focus. */
function forwardedShortcut(input: Electron.Input): boolean {
  if (input.type !== 'keyDown' || !(input.meta || input.control) || input.alt) return false;
  const key = input.key.toLowerCase();
  return (key === 'o' && input.shift) || (key === 'l' && !input.shift) || key === 'k';
}

export type WaitCondition =
  | { kind: 'text'; text: string }
  | { kind: 'url'; text: string }
  | { kind: 'idle' }
  | { kind: 'time'; ms: number };

export interface BrowserPaneState {
  sessionId: string;
  open: boolean;
  url: string;
  title: string;
  agentControl: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** What the agent is doing right now, in plain words; null when idle. */
  activity: string | null;
  /** The page lives in its own window instead of the side panel. */
  poppedOut: boolean;
}

/** A shortcut pressed inside a page, replayed in the app's renderer. */
export interface ForwardedKey {
  key: string;
  code: string;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  control: boolean;
}

interface AgentActivity {
  label: string | null;
  /** Page input before this epoch-ms is the agent's; Infinity mid-command. */
  actingUntil: number;
  clearTimer?: ReturnType<typeof setTimeout>;
}

export type BrowserPaneStateListener = (state: BrowserPaneState) => void;

interface PaneEntry {
  view: WebContentsView;
  cdp: BrowserCDP;
  network: NetworkLog;
  agentControl: boolean;
  /** Settles once the initial about:blank load has finished (or been aborted). */
  ready: Promise<unknown>;
  docked: boolean;
  popout: BaseWindow | null;
  lastUsed: number;
}

function isReleaseShortcut(input: Electron.Input): boolean {
  return (
    input.type === 'keyDown' &&
    input.key.toLowerCase() === 'r' &&
    input.shift &&
    (input.control || input.meta)
  );
}

class BrowserPaneManager {
  private readonly panes = new Map<string, PaneEntry>();
  private listener: BrowserPaneStateListener | null = null;
  private host: BrowserWindow | null = null;
  private surface: Surface = HIDDEN_SURFACE;
  private readonly activity = new Map<string, AgentActivity>();
  private readonly guardedSessions = new WeakSet<Session>();
  private keyListener: ((key: ForwardedKey) => void) | null = null;

  onForwardedKey(listener: (key: ForwardedKey) => void): void {
    this.keyListener = listener;
  }

  onStateChanged(listener: BrowserPaneStateListener): void {
    this.listener = listener;
  }

  private emitState(sessionId: string): void {
    if (!this.listener) return;
    this.listener(this.getState(sessionId));
  }

  private livePane(sessionId: string): PaneEntry | undefined {
    const entry = this.panes.get(sessionId);
    return entry && !entry.view.webContents.isDestroyed() ? entry : undefined;
  }

  getState(sessionId: string): BrowserPaneState {
    const entry = this.livePane(sessionId);
    const wc = entry?.view.webContents;
    return {
      sessionId,
      open: !!entry,
      url: wc?.getURL() ?? '',
      title: wc?.getTitle() ?? '',
      agentControl: entry?.agentControl ?? false,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
      loading: wc?.isLoading() ?? false,
      activity: entry ? (this.activity.get(sessionId)?.label ?? null) : null,
      poppedOut: !!entry?.popout,
    };
  }

  private requirePane(sessionId: string): PaneEntry {
    const entry = this.livePane(sessionId);
    if (!entry) {
      throw new Error('No browser open for this session — run "open" first.');
    }
    return entry;
  }

  /** Like `requirePane`, but also rejects once the user has taken over —
   *  every command that acts *on the page* (as opposed to just reading it)
   *  must go through this, or a taken-over page would still be silently
   *  clickable/fillable/navigable by the agent while the pane tells the user
   *  otherwise. Call `open` again to reclaim control before retrying. */
  private requireControlledPane(sessionId: string): PaneEntry {
    const entry = this.requirePane(sessionId);
    if (!entry.agentControl) {
      throw new Error(
        'The user deliberately took control of this browser — they may be actively using it right now. ' +
          'Do not call "open" to reclaim it as routine error recovery. Stop and tell the user what you were ' +
          'trying to do, and only reclaim if they explicitly ask you to continue.',
      );
    }
    return entry;
  }

  /* ---------------------------- surface ----------------------------- */

  /**
   * Called by the renderer whenever the side panel's page slot moves,
   * resizes, shows, hides, freezes, or switches chat. Cheap and idempotent,
   * so it can run every animation frame.
   */
  setSurface(host: BrowserWindow, surface: Surface): void {
    if (this.host !== host) {
      this.detachAll();
      this.host = host;
      host.once('closed', () => {
        if (this.host === host) {
          this.host = null;
          for (const entry of this.panes.values()) entry.docked = false;
        }
      });
    }
    this.surface = { ...surface, bounds: roundBounds(surface.bounds) };
    for (const [sessionId, entry] of this.panes) this.applySurface(sessionId, entry);
  }

  private applySurface(sessionId: string, entry: PaneEntry): void {
    const host = this.host;
    if (!host || host.isDestroyed() || entry.view.webContents.isDestroyed()) return;
    if (entry.popout) return;
    if (shouldDock(sessionId, this.surface)) {
      entry.lastUsed = Date.now();
      entry.view.setBounds(this.surface.bounds);
      if (!entry.docked) {
        host.contentView.addChildView(entry.view);
        entry.docked = true;
        entry.cdp.setPainting(true);
      }
    } else if (entry.docked) {
      // Detached pages keep their last bounds as the viewport and keep
      // running (backgroundThrottling is off) — see BROWSER-PANE.md §4.6.
      host.contentView.removeChildView(entry.view);
      entry.docked = false;
      entry.cdp.setPainting(false);
    }
  }

  private detachAll(): void {
    for (const entry of this.panes.values()) {
      if (entry.popout) continue;
      if (entry.docked && this.host && !this.host.isDestroyed()) {
        this.host.contentView.removeChildView(entry.view);
      }
      entry.docked = false;
    }
  }

  /** Still image standing in for the page while an overlay covers it. */
  async freezeImage(sessionId: string): Promise<string | null> {
    const entry = this.livePane(sessionId);
    if (!entry) return null;
    try {
      return await entry.cdp.captureFrame(FREEZE_JPEG_QUALITY);
    } catch (err) {
      log.debug(`freeze image failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /* --------------------------- lifecycle ---------------------------- */

  private open(sessionId: string): PaneEntry {
    const existing = this.livePane(sessionId);
    if (existing) {
      if (!existing.agentControl) this.setControl(sessionId, existing, true);
      return existing;
    }

    this.enforcePageCap();
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        // Detached pages must keep normal timer speed: throttled to ~1 tick/s
        // they'd stall SPAs and `wait`. Costs Electron's capturePage for
        // detached views, so every image goes through CDP instead.
        backgroundThrottling: false,
        // Never Electron's defaultSession (the app shell's own cookies). Per
        // chat by default; one shared jar when the user opts in so sign-ins
        // carry across chats.
        partition: getSettings().browserSharedProfile
          ? 'persist:browser-pane-shared'
          : `persist:browser-pane-${sessionId}`,
      },
    });
    view.setBounds({ x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    view.setBackgroundColor('#ffffff');
    const wc = view.webContents;
    const cdp = new BrowserCDP(wc);
    // Gives the page a renderer target before any CDP command races it — see
    // BrowserCDP.setReady.
    const blankLoaded = wc.loadURL('about:blank').catch(() => undefined);
    cdp.setReady(blankLoaded);
    const entry: PaneEntry = {
      view,
      cdp,
      network: new NetworkLog(wc.session, wc.id),
      agentControl: true,
      // Every first real load waits on this, so the dialog guard is
      // registered before any page script can call alert().
      ready: blankLoaded.then(() =>
        cdp.init().catch((err) => {
          log.warn(`CDP init failed: ${err instanceof Error ? err.message : String(err)}`);
        }),
      ),
      docked: false,
      popout: null,
      lastUsed: Date.now(),
    };
    this.denyPermissions(wc.session);
    this.panes.set(sessionId, entry);

    // `navigate` validates its own argument, but a redirect, link, or
    // evaluate-triggered navigation bypasses that — the scheme check also has
    // to live on the navigation primitives themselves.
    const blockDisallowedNavigation = (event: Electron.Event, url: string): void => {
      if (!isAllowedNavigateUrl(url)) event.preventDefault();
    };
    wc.on('will-navigate', blockDisallowedNavigation);
    wc.on('will-redirect', blockDisallowedNavigation);
    // target=_blank / window.open() would spawn an unmanaged window with
    // none of the guards above; load it in this page instead.
    wc.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigateUrl(url)) {
        void entry.ready.then(() => wc.loadURL(url)).catch(() => undefined);
      }
      return { action: 'deny' };
    });
    const emit = (): void => {
      if (entry.popout && !entry.popout.isDestroyed()) {
        entry.popout.setTitle(this.popoutTitle(entry));
      }
      this.emitState(sessionId);
    };
    wc.on('did-start-loading', emit);
    wc.on('did-stop-loading', emit);
    wc.on('page-title-updated', emit);
    wc.on('did-navigate', emit);
    wc.on('did-navigate-in-page', emit);
    wc.on('before-input-event', (event, input) => {
      if (isReleaseShortcut(input)) {
        this.release(sessionId);
      } else if (forwardedShortcut(input) && this.host && !entry.popout) {
        event.preventDefault();
        this.host.webContents.focus();
        this.keyListener?.({
          key: input.key,
          code: input.code,
          shift: input.shift,
          alt: input.alt,
          meta: input.meta,
          control: input.control,
        });
      }
    });
    // CDP input never fires before-input-event, but does fire input-event —
    // so the agent-acting window is what tells the agent's clicks and keys
    // from the user's. A physical click or keystroke means the user wants to
    // act now; letting the agent carry on would fight them. Scroll/hover
    // don't count, and neither do modifier shortcuts.
    wc.on('input-event', (_event, input) => {
      const pressed =
        input.type === 'mouseDown' ||
        ((input.type === 'rawKeyDown' || input.type === 'keyDown') &&
          !input.modifiers?.some((m) => m === 'meta' || m === 'control'));
      if (!pressed || !entry.agentControl) return;
      const acting = this.activity.get(sessionId);
      if (acting && Date.now() < acting.actingUntil) return;
      this.release(sessionId);
    });
    wc.once('destroyed', () => {
      if (entry.docked && this.host && !this.host.isDestroyed()) {
        this.host.contentView.removeChildView(view);
      }
      if (entry.popout && !entry.popout.isDestroyed()) entry.popout.destroy();
      entry.cdp.detach();
      entry.network.dispose();
      if (this.panes.get(sessionId) === entry) this.panes.delete(sessionId);
      emit();
    });

    this.applySurface(sessionId, entry);
    emit();
    return entry;
  }

  /** Pages get no camera, mic, location, notifications, etc. */
  private denyPermissions(session: Session): void {
    if (this.guardedSessions.has(session)) return;
    this.guardedSessions.add(session);
    session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
  }

  /** Before opening another page, close the least recently used idle one. */
  private enforcePageCap(): void {
    const live = [...this.panes.entries()].filter(([, e]) => !e.view.webContents.isDestroyed());
    if (live.length < MAX_OPEN_PAGES) return;
    const idle = live
      .filter(([id, e]) => !e.docked && !e.popout && !this.activity.get(id)?.label)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    const victim = idle[0];
    if (!victim) return;
    log.info(`closing least recently used browser page to stay under ${MAX_OPEN_PAGES}`);
    void this.close(victim[0]);
  }

  /* ------------------------- agent activity -------------------------- */

  beginAgentCommand(sessionId: string, label: string | null): void {
    const current = this.activity.get(sessionId);
    if (current?.clearTimer) clearTimeout(current.clearTimer);
    this.activity.set(sessionId, {
      label: label ?? current?.label ?? null,
      actingUntil: Number.POSITIVE_INFINITY,
    });
    const entry = this.livePane(sessionId);
    if (entry) entry.lastUsed = Date.now();
    if (label) this.emitState(sessionId);
  }

  endAgentCommand(sessionId: string): void {
    const current = this.activity.get(sessionId);
    if (!current) return;
    current.actingUntil = Date.now() + AGENT_INPUT_GRACE_MS;
    current.clearTimer = setTimeout(() => {
      if (this.activity.get(sessionId) !== current) return;
      this.activity.delete(sessionId);
      this.emitState(sessionId);
    }, ACTIVITY_LINGER_MS);
    this.emitState(sessionId);
  }

  describeRef(sessionId: string, ref: string): string | null {
    return this.livePane(sessionId)?.cdp.describeRef(ref) ?? null;
  }

  drainDialogs(sessionId: string): PageDialog[] {
    return this.livePane(sessionId)?.cdp.drainDialogs() ?? [];
  }

  /* ---------------------------- pop out ------------------------------ */

  popOut(sessionId: string): BrowserPaneState {
    const entry = this.requirePane(sessionId);
    if (entry.popout) {
      entry.popout.focus();
      return this.getState(sessionId);
    }
    if (entry.docked && this.host && !this.host.isDestroyed()) {
      this.host.contentView.removeChildView(entry.view);
      entry.docked = false;
      entry.cdp.setPainting(false);
    }
    const win = new BaseWindow({
      width: POPOUT_WIDTH,
      height: POPOUT_HEIGHT,
      title: this.popoutTitle(entry),
    });
    entry.popout = win;
    win.contentView.addChildView(entry.view);
    entry.cdp.setPainting(true);
    const fit = (): void => {
      const [width, height] = win.getContentSize();
      entry.view.setBounds({ x: 0, y: 0, width, height });
    };
    fit();
    win.on('resize', fit);
    // Closing the window docks the page back; it doesn't close the page.
    win.on('close', () => {
      if (!entry.view.webContents.isDestroyed()) win.contentView.removeChildView(entry.view);
      entry.popout = null;
      entry.cdp.setPainting(false);
      this.applySurface(sessionId, entry);
      this.emitState(sessionId);
    });
    this.emitState(sessionId);
    return this.getState(sessionId);
  }

  dock(sessionId: string): BrowserPaneState {
    this.livePane(sessionId)?.popout?.close();
    return this.getState(sessionId);
  }

  private popoutTitle(entry: PaneEntry): string {
    const page = entry.view.webContents.getTitle() || 'Browser';
    return `${page} — ${entry.agentControl ? 'Agent can drive' : 'You are in control'}`;
  }

  openDevTools(sessionId: string): void {
    this.requirePane(sessionId).view.webContents.openDevTools({ mode: 'detach' });
  }

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        `navigate: "${url}" is not a valid absolute URL (include the scheme, e.g. "https://...").`,
      );
    }
    if (!isAllowedNavigateUrl(parsed.toString())) {
      throw new Error(
        `navigate: scheme "${parsed.protocol}" is not allowed — only http:, https:, and about: are permitted.`,
      );
    }

    const entry = this.controlledOrOpen(sessionId);
    // A loadURL issued while the initial about:blank is still loading can
    // lose the race and leave the page on about:blank.
    await entry.ready;
    await entry.view.webContents.loadURL(url);
    return { url: entry.view.webContents.getURL(), title: entry.view.webContents.getTitle() };
  }

  /** Commands that set the page up (navigate, emulation) open it on demand. */
  private controlledOrOpen(sessionId: string): PaneEntry {
    return this.livePane(sessionId) ? this.requireControlledPane(sessionId) : this.open(sessionId);
  }

  ensureOpen(sessionId: string): BrowserPaneState {
    this.open(sessionId);
    return this.getState(sessionId);
  }

  back(sessionId: string): void {
    this.requireControlledPane(sessionId).view.webContents.navigationHistory.goBack();
  }

  forward(sessionId: string): void {
    this.requireControlledPane(sessionId).view.webContents.navigationHistory.goForward();
  }

  /* ------------------------ user (pane chrome) ----------------------- */
  // The chrome navigates regardless of who controls the page: the user can
  // always steer their own browser. Opening from the chrome leaves the page
  // usable by the agent.

  userOpen(sessionId: string): BrowserPaneState {
    if (!this.livePane(sessionId)) this.open(sessionId);
    return this.getState(sessionId);
  }

  async userNavigate(sessionId: string, input: string): Promise<BrowserPaneState> {
    const url = normalizeUserUrl(input);
    if (!url) throw new Error(`"${input}" isn't an http(s) address.`);
    const entry = this.livePane(sessionId) ?? this.open(sessionId);
    await entry.ready;
    // Failed loads (DNS, refused) render Chromium's error page; that's the
    // feedback the user needs, so don't surface the rejection.
    await entry.view.webContents.loadURL(url).catch(() => undefined);
    return this.getState(sessionId);
  }

  userHistory(sessionId: string, action: 'back' | 'forward' | 'reload' | 'stop'): void {
    const wc = this.requirePane(sessionId).view.webContents;
    if (action === 'back') wc.navigationHistory.goBack();
    else if (action === 'forward') wc.navigationHistory.goForward();
    else if (action === 'reload') wc.reload();
    else wc.stop();
  }

  handToAgent(sessionId: string): BrowserPaneState {
    const entry = this.livePane(sessionId);
    if (entry && !entry.agentControl) this.setControl(sessionId, entry, true);
    return this.getState(sessionId);
  }

  /** Native page dialogs while the user is in control; non-blocking for the agent. */
  private setControl(sessionId: string, entry: PaneEntry, agent: boolean): void {
    entry.agentControl = agent;
    void entry.cdp.setNativeDialogs(!agent).catch(() => undefined);
    if (entry.popout && !entry.popout.isDestroyed()) {
      entry.popout.setTitle(this.popoutTitle(entry));
    }
    this.emitState(sessionId);
  }

  /* -------------------------- agent commands ------------------------- */

  snapshot(sessionId: string, options?: SnapshotOptions): Promise<AccessibilitySnapshot> {
    return this.requirePane(sessionId).cdp.getAccessibilitySnapshot(options);
  }

  pageText(sessionId: string): Promise<string> {
    return this.requirePane(sessionId).cdp.getPageText();
  }

  network(sessionId: string, query: NetworkQuery): NetworkEntry[] {
    return this.requirePane(sessionId).network.query(query);
  }

  setViewport(sessionId: string, viewport: ViewportOverride | null): Promise<void> {
    return this.controlledOrOpen(sessionId).cdp.setViewport(viewport);
  }

  setColorScheme(sessionId: string, scheme: ColorScheme | null): Promise<void> {
    return this.controlledOrOpen(sessionId).cdp.setColorScheme(scheme);
  }

  click(sessionId: string, ref: string): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.clickElement(ref);
  }

  clickAt(sessionId: string, x: number, y: number): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.clickAt(x, y);
  }

  hover(sessionId: string, target: string | { x: number; y: number }): Promise<void> {
    const cdp = this.requireControlledPane(sessionId).cdp;
    return typeof target === 'string'
      ? cdp.hoverElement(target)
      : cdp.moveMouse(target.x, target.y);
  }

  /** Polls until `condition` holds; throws once `timeoutMs` passes. */
  async wait(sessionId: string, condition: WaitCondition, timeoutMs: number): Promise<number> {
    const startedAt = Date.now();
    if (condition.kind === 'time') {
      await new Promise((r) => setTimeout(r, Math.min(condition.ms, timeoutMs)));
      return Date.now() - startedAt;
    }
    const check = async (): Promise<boolean> => {
      const entry = this.requirePane(sessionId);
      switch (condition.kind) {
        case 'url':
          return entry.view.webContents
            .getURL()
            .toLowerCase()
            .includes(condition.text.toLowerCase());
        case 'idle':
          return (
            entry.network.inFlight === 0 &&
            Date.now() - entry.network.lastActivity >= NETWORK_IDLE_MS
          );
        case 'text':
          // A page mid-navigation has no execution context yet — not a match.
          return entry.cdp.pageContainsText(condition.text).catch(() => false);
      }
    };
    while (!(await check())) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `wait timed out after ${Math.round(timeoutMs / 1000)}s — the condition never held. Check the page with "text" or "screenshot".`,
        );
      }
      await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    }
    return Date.now() - startedAt;
  }

  fill(sessionId: string, ref: string, value: string): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.fillElement(ref, value);
  }

  select(sessionId: string, ref: string, value: string): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.selectOption(ref, value);
  }

  type(sessionId: string, text: string): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.typeText(text);
  }

  key(
    sessionId: string,
    key: string,
    modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>,
  ): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.sendKey(key, modifiers);
  }

  scroll(
    sessionId: string,
    direction: 'up' | 'down' | 'left' | 'right',
    amount = DEFAULT_SCROLL_AMOUNT,
  ): Promise<void> {
    const cdp = this.requireControlledPane(sessionId).cdp;
    const deltas: Record<typeof direction, [number, number]> = {
      up: [0, -amount],
      down: [0, amount],
      left: [-amount, 0],
      right: [amount, 0],
    };
    const [dx, dy] = deltas[direction];
    return cdp.scrollBy(dx, dy);
  }

  screenshot(sessionId: string, options: ScreenshotOptions): Promise<Screenshot> {
    return this.requirePane(sessionId).cdp.captureScreenshot(options);
  }

  evaluate(sessionId: string, expression: string): Promise<unknown> {
    return this.requireControlledPane(sessionId).cdp.evaluate(expression);
  }

  consoleLogs(
    sessionId: string,
    limit: number,
    level?: ConsoleLogEntry['level'],
  ): ConsoleLogEntry[] {
    return this.requirePane(sessionId).cdp.getConsoleLogs(limit, level);
  }

  release(sessionId: string): BrowserPaneState {
    const entry = this.livePane(sessionId);
    if (entry && entry.agentControl) this.setControl(sessionId, entry, false);
    return this.getState(sessionId);
  }

  async close(sessionId: string): Promise<BrowserPaneState> {
    const entry = this.livePane(sessionId);
    if (!entry) return this.getState(sessionId);
    if (entry.docked && this.host && !this.host.isDestroyed()) {
      this.host.contentView.removeChildView(entry.view);
      entry.docked = false;
    }
    if (entry.popout && !entry.popout.isDestroyed()) {
      entry.popout.removeAllListeners('close');
      entry.popout.destroy();
      entry.popout = null;
    }
    // Skips beforeunload: a page can't veto the user or agent closing it.
    entry.view.webContents.close();
    return this.getState(sessionId);
  }

  destroyForSession(sessionId: string): void {
    void this.close(sessionId);
  }

  destroyAll(): void {
    for (const sessionId of [...this.panes.keys()]) void this.close(sessionId);
  }
}

export const browserPaneManager = new BrowserPaneManager();
