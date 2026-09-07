// Session-scoped Electron browser windows the `browser_tool` drives via CDP.
//
// One window per chat session, created lazily on the first `open` command
// and torn down when the session ends or the user closes the window. The
// window is a real, visible, app-owned BrowserWindow (not a headless/hidden
// automation target) — the user watches the agent drive it live, the same
// way they watch shell output stream in the terminal pane.

import { BrowserWindow } from 'electron';
import { createLogger } from '../logger';
import { BrowserCDP, MAX_Z_INDEX, type AccessibilitySnapshot, type ConsoleLogEntry } from './browser-cdp';

const log = createLogger('browser-pane');

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 860;
const DEFAULT_SCROLL_AMOUNT = 400;
const CONTROL_BADGE_ID = '__minimalist_agent_control_badge__';
const CLOSE_TIMEOUT_MS = 3_000;
// file:/data:/chrome: etc. would let the agent read local files or
// app-internal state back into its own tool output; about: is just the
// window's initial blank state.
const ALLOWED_NAVIGATE_SCHEMES = new Set(['http:', 'https:', 'about:']);

export interface BrowserPaneState {
  sessionId: string;
  open: boolean;
  url: string;
  title: string;
  agentControl: boolean;
}

export type BrowserPaneStateListener = (state: BrowserPaneState) => void;

interface PaneEntry {
  window: BrowserWindow;
  cdp: BrowserCDP;
  agentControl: boolean;
}

function isReleaseShortcut(input: Electron.Input): boolean {
  return (
    input.type === 'keyDown' &&
    input.key.toLowerCase() === 'r' &&
    input.shift &&
    (input.control || input.meta)
  );
}

function isAllowedNavigateUrl(url: string): boolean {
  try {
    return ALLOWED_NAVIGATE_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

class BrowserPaneManager {
  private readonly panes = new Map<string, PaneEntry>();
  private listener: BrowserPaneStateListener | null = null;

  onStateChanged(listener: BrowserPaneStateListener): void {
    this.listener = listener;
  }

  private emitState(sessionId: string): void {
    if (!this.listener) return;
    this.listener(this.getState(sessionId));
  }

  getState(sessionId: string): BrowserPaneState {
    const entry = this.panes.get(sessionId);
    const isLive = !!entry && !entry.window.isDestroyed();
    return {
      sessionId,
      open: isLive,
      url: isLive ? entry.window.webContents.getURL() : '',
      title: isLive ? entry.window.webContents.getTitle() : '',
      agentControl: isLive ? entry.agentControl : false,
    };
  }

  /** True if `win` is one of the browser panes this manager owns, as opposed to
   *  the app's own chat window — lets callers that need "the main app window"
   *  (e.g. broadcasting an IPC event) skip past pane windows in
   *  `BrowserWindow.getAllWindows()` instead of assuming index 0 is always it. */
  isPaneWindow(win: BrowserWindow): boolean {
    for (const entry of this.panes.values()) {
      if (entry.window === win) return true;
    }
    return false;
  }

  private requirePane(sessionId: string): PaneEntry {
    const entry = this.panes.get(sessionId);
    if (!entry || entry.window.isDestroyed()) {
      throw new Error('No browser window open for this session — run "open" first.');
    }
    return entry;
  }

  /** Like `requirePane`, but also rejects once the user has `release`d control
   *  — every command that acts *on the page* (as opposed to just reading it)
   *  must go through this, or a released pane would still be silently
   *  clickable/fillable/navigable by the agent while the badge tells the user
   *  otherwise. Call `open` again to reclaim control before retrying. */
  private requireControlledPane(sessionId: string): PaneEntry {
    const entry = this.requirePane(sessionId);
    if (!entry.agentControl) {
      throw new Error(
        'The user deliberately took control of this window — they may be actively using it right now. ' +
        'Do not call "open" to reclaim it as routine error recovery. Stop and tell the user what you were ' +
        'trying to do, and only reclaim if they explicitly ask you to continue.',
      );
    }
    return entry;
  }

  private async injectControlBadge(entry: PaneEntry): Promise<void> {
    if (!entry.agentControl) return;
    try {
      await entry.cdp.evaluate(`(() => {
        const id = ${JSON.stringify(CONTROL_BADGE_ID)};
        if (document.getElementById(id)) return;
        const badge = document.createElement('div');
        badge.id = id;
        badge.textContent = '\\u{1F916} Agent is controlling this window \\u2014 Cmd/Ctrl+Shift+R to take over';
        badge.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:${MAX_Z_INDEX};padding:4px 10px;border-radius:6px;font:12px -apple-system,sans-serif;background:rgba(15,23,42,0.85);color:#fff;pointer-events:none;';
        document.documentElement.appendChild(badge);
      })()`);
    } catch (err) {
      log.warn(`control badge injection failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private open(sessionId: string): PaneEntry {
    const existing = this.panes.get(sessionId);
    if (existing && !existing.window.isDestroyed()) {
      if (!existing.agentControl) {
        existing.agentControl = true;
        void this.injectControlBadge(existing);
        this.emitState(sessionId);
      }
      return existing;
    }

    const window = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      title: 'Browser — Minimalist Agent',
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        // Per-session partition — without it every pane silently shares
        // Electron's defaultSession (and the app shell's own cookies) with
        // every other chat session.
        partition: `persist:browser-pane-${sessionId}`,
      },
    });
    const entry: PaneEntry = { window, cdp: new BrowserCDP(window.webContents), agentControl: true };
    this.panes.set(sessionId, entry);

    // `navigate` validates its own argument, but a redirect, link, or
    // evaluate-triggered navigation bypasses that — the scheme check also has
    // to live on the navigation primitives themselves.
    const blockDisallowedNavigation = (event: Electron.Event, url: string): void => {
      if (!isAllowedNavigateUrl(url)) event.preventDefault();
    };
    window.webContents.on('will-navigate', blockDisallowedNavigation);
    window.webContents.on('will-redirect', blockDisallowedNavigation);
    // Without this, target=_blank / window.open() spawn an unmanaged
    // BrowserWindow with none of the guards above.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigateUrl(url)) {
        this.navigate(sessionId, url).catch((err) => {
          log.warn(`window-open navigate failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
      return { action: 'deny' };
    });
    window.webContents.on('did-finish-load', () => {
      void this.injectControlBadge(entry);
      this.emitState(sessionId);
    });
    window.webContents.on('page-title-updated', () => this.emitState(sessionId));
    window.webContents.on('did-navigate', () => this.emitState(sessionId));
    window.webContents.on('did-navigate-in-page', () => this.emitState(sessionId));
    window.webContents.on('before-input-event', (_event, input) => {
      if (isReleaseShortcut(input)) this.release(sessionId);
    });
    window.on('closed', () => {
      entry.cdp.detach();
      this.panes.delete(sessionId);
      this.emitState(sessionId);
    });

    window.minimize();

    return entry;
  }

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`navigate: "${url}" is not a valid absolute URL (include the scheme, e.g. "https://...").`);
    }
    if (!ALLOWED_NAVIGATE_SCHEMES.has(parsed.protocol)) {
      throw new Error(
        `navigate: scheme "${parsed.protocol}" is not allowed — only http:, https:, and about: are permitted.`,
      );
    }

    const existing = this.panes.get(sessionId);
    const entry = existing && !existing.window.isDestroyed() ? this.requireControlledPane(sessionId) : this.open(sessionId);
    await entry.window.loadURL(url);
    return { url: entry.window.webContents.getURL(), title: entry.window.webContents.getTitle() };
  }

  ensureOpen(sessionId: string): BrowserPaneState {
    this.open(sessionId);
    return this.getState(sessionId);
  }

  back(sessionId: string): void {
    this.requireControlledPane(sessionId).window.webContents.navigationHistory.goBack();
  }

  forward(sessionId: string): void {
    this.requireControlledPane(sessionId).window.webContents.navigationHistory.goForward();
  }

  snapshot(sessionId: string): Promise<AccessibilitySnapshot> {
    return this.requirePane(sessionId).cdp.getAccessibilitySnapshot();
  }

  click(sessionId: string, ref: string): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.clickElement(ref);
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

  key(sessionId: string, key: string, modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>): Promise<void> {
    return this.requireControlledPane(sessionId).cdp.sendKey(key, modifiers);
  }

  scroll(sessionId: string, direction: 'up' | 'down' | 'left' | 'right', amount = DEFAULT_SCROLL_AMOUNT): Promise<void> {
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

  screenshot(sessionId: string, options: { annotated?: boolean }): Promise<Buffer> {
    return this.requirePane(sessionId).cdp.captureScreenshot(options);
  }

  evaluate(sessionId: string, expression: string): Promise<unknown> {
    return this.requireControlledPane(sessionId).cdp.evaluate(expression);
  }

  consoleLogs(sessionId: string, limit: number, level?: ConsoleLogEntry['level']): ConsoleLogEntry[] {
    return this.requirePane(sessionId).cdp.getConsoleLogs(limit, level);
  }

  release(sessionId: string): BrowserPaneState {
    const entry = this.panes.get(sessionId);
    if (entry && !entry.window.isDestroyed()) {
      entry.agentControl = false;
      void entry.cdp.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(CONTROL_BADGE_ID)}); if (el) el.remove(); })()`).catch(() => {});
    }
    this.emitState(sessionId);
    return this.getState(sessionId);
  }

  /** Un-minimizes and brings the pane to the front — for the "Show" button in
   *  the chat header pill, so a minimized/backgrounded window doesn't have to
   *  be hunted down manually. */
  focus(sessionId: string): void {
    const entry = this.requirePane(sessionId);
    if (entry.window.isMinimized()) entry.window.restore();
    entry.window.show();
    entry.window.focus();
  }

  close(sessionId: string): Promise<BrowserPaneState> {
    const entry = this.panes.get(sessionId);
    if (!entry || entry.window.isDestroyed()) return Promise.resolve(this.getState(sessionId));

    return new Promise((resolve) => {
      // beforeunload can delay/cancel window.close(), so wait for the real
      // 'closed' event; force-destroy past the timeout so a blocked close
      // can't leave a stale, still-usable pane.
      const timeout = setTimeout(() => {
        if (!entry.window.isDestroyed()) entry.window.destroy();
      }, CLOSE_TIMEOUT_MS);
      entry.window.once('closed', () => {
        clearTimeout(timeout);
        resolve(this.getState(sessionId));
      });
      entry.window.close();
    });
  }

  destroyForSession(sessionId: string): void {
    void this.close(sessionId);
  }

  destroyAll(): void {
    for (const sessionId of [...this.panes.keys()]) void this.close(sessionId);
  }
}

export const browserPaneManager = new BrowserPaneManager();
