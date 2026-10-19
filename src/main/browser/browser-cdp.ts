// Chrome DevTools Protocol wrapper around one session's browser WebContents.
//
// Uses `webContents.debugger` (the same CDP transport Playwright/Stagehand
// use) so element interaction is ref-based and deterministic instead of
// blind coordinate guessing. Trimmed to the commands `browser_tool` actually
// exposes — see docs/BROWSER-TOOL.md for the full command list and the
// deferred commands (drag, clipboard, upload).

import type { WebContents } from 'electron';
import { createLogger } from '../logger';
import {
  DIALOG_BINDING,
  dialogGuardScript,
  parseDialogPayload,
  type PageDialog,
} from './browser-dialogs';

const log = createLogger('browser-cdp');

const CDP_PROTOCOL_VERSION = '1.3';
export const MAX_SNAPSHOT_NODES = 300;
const MAX_FIND_RESULTS = 20;
// Retina panes would otherwise return ~2560px-wide PNGs — a large, mostly
// wasted image-token cost per screenshot.
const MAX_SCREENSHOT_WIDTH_PX = 1280;
// A CDP command against a hung or page-less target never settles; fail the
// tool call instead of hanging the turn.
const COMMAND_TIMEOUT_MS = 15_000;
// A painting page answers a CDP mouseMoved in ~1ms; one that isn't stalls ~5s.
const MOUSE_PROBE_MS = 300;
const MAX_CONSOLE_ENTRIES = 200;
const OVERLAY_ELEMENT_ID = '__minimalist_agent_browser_overlay__';
export const MAX_Z_INDEX = 2_147_483_647;

// Chrome DevTools' `Input.dispatchKeyEvent` modifiers field is a bitmask —
// see https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchKeyEvent
const CDP_MODIFIER_ALT = 1;
const CDP_MODIFIER_CONTROL = 2;
const CDP_MODIFIER_META = 4;
const CDP_MODIFIER_SHIFT = 8;

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'treeitem',
]);

const CONTENT_ROLES = new Set([
  'heading',
  'img',
  'table',
  'list',
  'listitem',
  'paragraph',
  'article',
  'main',
  'navigation',
  'form',
  'alert',
  'dialog',
  'status',
]);

export interface AccessibilityNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
}

export interface SnapshotOptions {
  /** Only interactive roles (buttons, links, inputs, …) — the cheap default for acting. */
  interactiveOnly?: boolean;
  /** Restrict to the subtree of this ref (from an earlier snapshot/find). */
  within?: string;
  maxNodes?: number;
  /** Case-insensitive match on name/value — powers `find`. */
  query?: string;
}

export interface ScreenshotOptions {
  annotated?: boolean;
  /** 0.1–1, relative to the default (width-capped) size. */
  scale?: number;
  /** Viewport CSS-pixel rectangle to capture instead of the whole viewport. */
  region?: { x0: number; y0: number; x1: number; y1: number };
}

export interface Screenshot {
  buffer: Buffer;
  /** Viewport size in CSS pixels — the coordinate space `region` uses. */
  viewport: { width: number; height: number };
  scale: number;
}

export interface ViewportOverride {
  width: number;
  height: number;
  mobile: boolean;
}

export type ColorScheme = 'light' | 'dark';

export interface AccessibilitySnapshot {
  url: string;
  title: string;
  nodes: AccessibilityNode[];
  /** Count of additional qualifying elements dropped once `MAX_SNAPSHOT_NODES`
   *  was reached — 0 when nothing was truncated. Surfaced to the model so it
   *  doesn't silently reason as if it has the full page structure. */
  truncatedCount: number;
}

export interface ElementGeometry {
  ref: string;
  role?: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clickX: number;
  clickY: number;
}

export interface ConsoleLogEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

export class BrowserCDP {
  private readonly webContents: WebContents;
  private attached = false;
  private refToBackendNodeId = new Map<string, number>();
  private refDetails = new Map<string, { role: string; name: string }>();
  private backendNodeIdToRef = new Map<number, string>();
  private nextRefId = 0;
  private consoleLog: ConsoleLogEntry[] = [];
  // The debugger stays attached for the page's life (the dialog guard needs
  // it); if something detaches it anyway, these are re-applied on re-attach.
  private viewport: ViewportOverride | null = null;
  private colorScheme: ColorScheme | null = null;
  // A window that never loaded a page has no renderer target: the first CDP
  // command hangs and the next crashes Electron. Attach waits on this.
  private ready: Promise<unknown> = Promise.resolve();
  private dialogs: PageDialog[] = [];
  private nativeDialogs = false;
  private dialogScriptId: string | null = null;
  // Whether the page is on screen (docked or popped out) and so paints frames.
  private painting = false;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    // Bound once: `.detach()` never removes listeners, and the debugger can
    // re-attach — binding inside `ensureAttached()` would duplicate both
    // listeners (and console entries) on every re-attach.
    this.webContents.debugger.on('detach', () => {
      this.attached = false;
      this.dialogScriptId = null;
    });
    this.webContents.debugger.on('message', (_event, method, params) => {
      if (method === 'Runtime.consoleAPICalled') {
        this.recordConsoleMessage(
          params as { type: string; args: Array<{ value?: unknown; description?: string }> },
        );
      } else if (method === 'Runtime.bindingCalled' && params?.name === DIALOG_BINDING) {
        const dialog = parseDialogPayload(String(params.payload ?? ''));
        if (dialog) this.dialogs.push(dialog);
      }
    });
    // Backend node IDs die with the document, so this stable-ref table (kept
    // only so @eN doesn't renumber within one page) would otherwise grow
    // unbounded across navigations.
    this.webContents.on('did-navigate', () => {
      this.backendNodeIdToRef.clear();
      this.nextRefId = 0;
    });
  }

  setReady(ready: Promise<unknown>): void {
    this.ready = ready;
  }

  private async ensureAttached(): Promise<void> {
    if (this.attached) return;
    await this.ready;
    if (this.attached) return;
    try {
      this.webContents.debugger.attach(CDP_PROTOCOL_VERSION);
    } catch (err) {
      if (!String(err).includes('Already attached')) throw err;
    }
    this.attached = true;
    await this.send('Runtime.enable');
    await this.send('Runtime.addBinding', { name: DIALOG_BINDING });
    await this.send('Page.enable');
    await this.installDialogGuard();
    await this.applyOverrides();
  }

  /** Attach now rather than on the first command, so the dialog guard is in
   *  place before the user or agent loads a page. */
  init(): Promise<void> {
    return this.ensureAttached();
  }

  private async installDialogGuard(): Promise<void> {
    if (this.dialogScriptId) {
      await this.send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: this.dialogScriptId,
      });
    }
    const source = dialogGuardScript(this.nativeDialogs);
    const { identifier } = await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    this.dialogScriptId = identifier as string;
    // The current document predates the registration.
    await this.send('Runtime.evaluate', { expression: source }).catch(() => undefined);
  }

  /** Native dialogs while the user controls the page; non-blocking otherwise. */
  async setNativeDialogs(native: boolean): Promise<void> {
    if (this.nativeDialogs === native) return;
    this.nativeDialogs = native;
    if (this.attached) await this.installDialogGuard();
  }

  /** Dialogs the page raised since the last call. */
  drainDialogs(): PageDialog[] {
    const drained = this.dialogs;
    this.dialogs = [];
    return drained;
  }

  private async applyOverrides(): Promise<void> {
    if (this.viewport) {
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: this.viewport.width,
        height: this.viewport.height,
        deviceScaleFactor: 0,
        mobile: this.viewport.mobile,
      });
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: this.viewport.mobile });
    }
    if (this.colorScheme) {
      await this.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: this.colorScheme }],
      });
    }
  }

  async setViewport(viewport: ViewportOverride | null): Promise<void> {
    this.viewport = viewport;
    if (viewport) {
      await this.applyOverrides();
      return;
    }
    await this.send('Emulation.clearDeviceMetricsOverride');
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  async setColorScheme(scheme: ColorScheme | null): Promise<void> {
    this.colorScheme = scheme;
    if (scheme) {
      await this.applyOverrides();
      return;
    }
    await this.send('Emulation.setEmulatedMedia', { features: [] });
  }

  private recordConsoleMessage(params: {
    type: string;
    args: Array<{ value?: unknown; description?: string }>;
  }): void {
    const level: ConsoleLogEntry['level'] =
      params.type === 'warning'
        ? 'warn'
        : params.type === 'error'
          ? 'error'
          : params.type === 'info'
            ? 'info'
            : 'log';
    const message = params.args.map((a) => normalize(a.value ?? a.description)).join(' ');
    this.consoleLog.push({ level, message, timestamp: Date.now() });
    if (this.consoleLog.length > MAX_CONSOLE_ENTRIES) this.consoleLog.shift();
  }

  detach(): void {
    if (!this.attached) return;
    try {
      this.webContents.debugger.detach();
    } catch (err) {
      log.warn(`detach failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.attached = false;
  }

  private async send(method: string, params?: Record<string, unknown>): Promise<any> {
    await this.ensureAttached();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `${method} timed out after ${COMMAND_TIMEOUT_MS / 1000}s — the page may be unresponsive.`,
            ),
          ),
        COMMAND_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([this.webContents.debugger.sendCommand(method, params), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  getConsoleLogs(limit: number, level?: ConsoleLogEntry['level']): ConsoleLogEntry[] {
    const filtered = level ? this.consoleLog.filter((e) => e.level === level) : this.consoleLog;
    return filtered.slice(-limit);
  }

  private allocateRef(backendNodeId: number): string {
    const existing = this.backendNodeIdToRef.get(backendNodeId);
    if (existing) return existing;
    this.nextRefId += 1;
    const ref = `@e${this.nextRefId}`;
    this.backendNodeIdToRef.set(backendNodeId, ref);
    return ref;
  }

  async getAccessibilitySnapshot(options: SnapshotOptions = {}): Promise<AccessibilitySnapshot> {
    // Resolve before the tree is re-read: a scoped/find pass keeps earlier refs
    // valid, a plain snapshot starts a fresh ref table.
    const withinBackendId =
      options.within !== undefined ? this.resolveBackendNodeId(options.within) : undefined;
    const tree = await this.send('Accessibility.getFullAXTree');
    const rawNodes = Array.isArray(tree?.nodes) ? (tree.nodes as any[]) : [];
    const scope = withinBackendId !== undefined ? subtreeNodeIds(rawNodes, withinBackendId) : null;
    const query = options.query?.toLowerCase();
    const maxNodes = query
      ? MAX_FIND_RESULTS
      : Math.min(options.maxNodes ?? MAX_SNAPSHOT_NODES, MAX_SNAPSHOT_NODES);

    if (!query && withinBackendId === undefined) {
      this.refToBackendNodeId.clear();
      this.refDetails.clear();
    }
    const nodes: AccessibilityNode[] = [];
    const seenBackendNodeIds = new Set<number>();
    let truncatedCount = 0;

    for (const rawNode of rawNodes) {
      if (scope && !scope.has(rawNode.nodeId)) continue;
      const role = normalize(rawNode.role?.value).toLowerCase();
      const name = normalize(rawNode.name?.value);
      const rawValue = rawNode.value?.value;
      const value = rawValue !== undefined && rawValue !== '' ? String(rawValue) : undefined;
      const backendNodeId: number | undefined =
        typeof rawNode.backendDOMNodeId === 'number' ? rawNode.backendDOMNodeId : undefined;

      const isInteractive = INTERACTIVE_ROLES.has(role);
      const isNamedContent = CONTENT_ROLES.has(role) && !!name;
      const isMeaningful = options.interactiveOnly
        ? isInteractive
        : isInteractive || isNamedContent || value !== undefined;
      if (!isMeaningful || backendNodeId === undefined) continue;
      if (
        query &&
        !name.toLowerCase().includes(query) &&
        !(value ?? '').toLowerCase().includes(query)
      ) {
        continue;
      }
      if (seenBackendNodeIds.has(backendNodeId)) continue;
      seenBackendNodeIds.add(backendNodeId);

      if (nodes.length >= maxNodes) {
        truncatedCount += 1;
        continue;
      }

      const disabled = (rawNode.properties as any[] | undefined)?.some(
        (p) => p.name === 'disabled' && p.value?.value === true,
      );

      const ref = this.allocateRef(backendNodeId);
      this.refToBackendNodeId.set(ref, backendNodeId);
      this.refDetails.set(ref, { role, name });
      nodes.push({ ref, role, name, value, ...(disabled ? { disabled: true } : {}) });
    }

    return {
      url: this.webContents.getURL(),
      title: this.webContents.getTitle(),
      nodes,
      truncatedCount,
    };
  }

  /** Readable text of the page's main content (or body), like a reader view. */
  async getPageText(): Promise<string> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('main, article, [role="main"]') || document.body;
        return el ? el.innerText : '';
      })()`,
      returnByValue: true,
    });
    return String(result?.result?.value ?? '');
  }

  /** `button "Sign in"` for a known ref — for the pane's activity label. */
  describeRef(ref: string): string | null {
    const details = this.refDetails.get(ref);
    if (!details) return null;
    return details.name ? `${details.role} ${JSON.stringify(details.name)}` : details.role;
  }

  private resolveBackendNodeId(ref: string): number {
    const backendNodeId = this.refToBackendNodeId.get(ref);
    if (backendNodeId === undefined) {
      throw new Error(`Element ${ref} not found — run "snapshot" again to get fresh refs.`);
    }
    return backendNodeId;
  }

  async getElementGeometry(ref: string): Promise<ElementGeometry> {
    const backendNodeId = this.resolveBackendNodeId(ref);
    const { model } = await this.send('DOM.getBoxModel', { backendNodeId });
    const [x0, y0, x1, y1, x2, y2, x3, y3] = model.content as number[];
    const x = Math.min(x0, x1, x2, x3);
    const y = Math.min(y0, y1, y2, y3);
    const maxX = Math.max(x0, x1, x2, x3);
    const maxY = Math.max(y0, y1, y2, y3);
    const details = this.refDetails.get(ref);
    return {
      ref,
      role: details?.role,
      name: details?.name,
      x,
      y,
      width: maxX - x,
      height: maxY - y,
      clickX: (x0 + x1 + x2 + x3) / 4,
      clickY: (y0 + y1 + y2 + y3) / 4,
    };
  }

  /** Scrolls the element into view and returns its center in viewport CSS px. */
  private async elementCenter(ref: string): Promise<{ x: number; y: number }> {
    const backendNodeId = this.resolveBackendNodeId(ref);
    const { object } = await this.send('DOM.resolveNode', { backendNodeId });
    await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: 'function() { this.scrollIntoViewIfNeeded(); }',
    });
    const geometry = await this.getElementGeometry(ref);
    return { x: Math.round(geometry.clickX), y: Math.round(geometry.clickY) };
  }

  async clickElement(ref: string): Promise<void> {
    const { x, y } = await this.elementCenter(ref);
    await this.clickAt(x, y);
  }

  async hoverElement(ref: string): Promise<void> {
    const { x, y } = await this.elementCenter(ref);
    await this.moveMouse(x, y);
  }

  setPainting(painting: boolean): void {
    this.painting = painting;
  }

  /*
   * Pointer input needs a page that paints frames: Chromium hit-tests real
   * input against compositor data, so on a page that isn't drawing — detached
   * from the panel, or docked while the app is minimized/occluded — a CDP
   * mouseMoved stalls ~5s and press/release never reach the page (measured).
   * So: probe with a real move; if the page doesn't answer quickly, dispatch
   * the events from inside the page instead. Synthetic events drive JS
   * handlers, links, and form controls, but are `isTrusted: false` and don't
   * apply CSS :hover.
   */
  private async realMouseMove(x: number, y: number): Promise<boolean> {
    if (!this.painting) return false;
    const moved = this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
    });
    const answered = await Promise.race([
      moved.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), MOUSE_PROBE_MS)),
    ]);
    if (!answered) moved.catch(() => undefined);
    return answered;
  }

  async moveMouse(x: number, y: number): Promise<void> {
    if (await this.realMouseMove(x, y)) return;
    await this.dispatchInPage(x, y, 'hover');
  }

  /** For canvas UIs and anything without an accessible ref. */
  async clickAt(x: number, y: number): Promise<void> {
    if (!(await this.realMouseMove(x, y))) {
      await this.dispatchInPage(x, y, 'click');
      return;
    }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }

  private async dispatchInPage(x: number, y: number, action: 'hover' | 'click'): Promise<void> {
    const result = await this.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return false;
        const init = { bubbles: true, cancelable: true, composed: true, view: window,
          clientX: ${x}, clientY: ${y}, button: 0, detail: 1 };
        const fire = (Ctor, type, extra = {}) => el.dispatchEvent(new Ctor(type, { ...init, ...extra }));
        fire(PointerEvent, 'pointerover'); fire(MouseEvent, 'mouseover');
        fire(PointerEvent, 'pointermove'); fire(MouseEvent, 'mousemove');
        el.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
        if (${action === 'click'}) {
          fire(PointerEvent, 'pointerdown', { buttons: 1 }); fire(MouseEvent, 'mousedown', { buttons: 1 });
          el.closest('input, textarea, select, button, a[href], [tabindex], [contenteditable]')?.focus();
          fire(PointerEvent, 'pointerup'); fire(MouseEvent, 'mouseup');
          fire(MouseEvent, 'click');
        }
        return true;
      })()`,
    });
    if (result?.result?.value === false) {
      throw new Error(`Nothing on the page at ${x},${y}.`);
    }
  }

  async pageContainsText(text: string): Promise<boolean> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(document.body?.innerText ?? '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`,
      returnByValue: true,
    });
    return result?.result?.value === true;
  }

  async fillElement(ref: string, value: string): Promise<void> {
    const backendNodeId = this.resolveBackendNodeId(ref);
    await this.send('DOM.focus', { backendNodeId });
    const { object } = await this.send('DOM.resolveNode', { backendNodeId });
    await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function(v) {
        this.value = '';
        this.dispatchEvent(new Event('input', { bubbles: true }));
      }`,
      arguments: [{ value }],
    });
    // One IME-style commit instead of two key events per character — a long
    // value used to cost thousands of CDP round trips. Frameworks still see
    // a native `input` event.
    if (value) await this.send('Input.insertText', { text: value });
    await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function() { this.dispatchEvent(new Event('change', { bubbles: true })); }`,
    });
  }

  async typeText(text: string): Promise<void> {
    for (const char of text) {
      // unmodifiedText mirrors `text` since typeText never sends modifier
      // chords. Full key/code synthesis (Puppeteer-style) is deferred until a
      // live test shows a framework that needs raw keydown, not just native input.
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
        unmodifiedText: char,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
        unmodifiedText: char,
      });
    }
  }

  async sendKey(
    key: string,
    modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>,
  ): Promise<void> {
    const modifierBits =
      (modifiers?.includes('alt') ? CDP_MODIFIER_ALT : 0) |
      (modifiers?.includes('control') ? CDP_MODIFIER_CONTROL : 0) |
      (modifiers?.includes('meta') ? CDP_MODIFIER_META : 0) |
      (modifiers?.includes('shift') ? CDP_MODIFIER_SHIFT : 0);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      windowsVirtualKeyCode: key.length === 1 ? key.charCodeAt(0) : undefined,
      modifiers: modifierBits,
    });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers: modifierBits });
  }

  async selectOption(ref: string, value: string): Promise<void> {
    const backendNodeId = this.resolveBackendNodeId(ref);
    const { object } = await this.send('DOM.resolveNode', { backendNodeId });
    const result = await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      returnByValue: true,
      functionDeclaration: `function(v) {
        if (!(this instanceof HTMLSelectElement)) return { ok: false, reason: 'not a <select> element' };
        this.value = v;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: this.value === v, actual: this.value };
      }`,
      arguments: [{ value }],
    });
    const outcome = result?.result?.value as
      { ok?: boolean; reason?: string; actual?: string } | undefined;
    if (outcome && outcome.ok === false) {
      throw new Error(
        outcome.reason ?? `Select did not apply value "${value}" (actual: "${outcome.actual}")`,
      );
    }
  }

  async scrollBy(deltaX: number, deltaY: number): Promise<void> {
    await this.send('Runtime.evaluate', { expression: `window.scrollBy(${deltaX}, ${deltaY})` });
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate() threw');
    }
    return result?.result?.value;
  }

  private async renderRefOverlay(nodes: AccessibilityNode[]): Promise<void> {
    const geometries = await Promise.all(
      nodes.map((n) => this.getElementGeometry(n.ref).catch(() => null)),
    );
    const boxes = geometries.filter((g): g is ElementGeometry => g !== null);
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const existing = document.getElementById(${JSON.stringify(OVERLAY_ELEMENT_ID)});
        if (existing) existing.remove();
        const root = document.createElement('div');
        root.id = ${JSON.stringify(OVERLAY_ELEMENT_ID)};
        root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:${MAX_Z_INDEX};';
        for (const box of ${JSON.stringify(boxes)}) {
          const rect = document.createElement('div');
          rect.style.cssText = \`position:fixed;left:\${box.x}px;top:\${box.y}px;width:\${box.width}px;height:\${box.height}px;border:2px solid #3b82f6;border-radius:4px;\`;
          root.appendChild(rect);
          const label = document.createElement('div');
          label.style.cssText = \`position:fixed;left:\${box.x}px;top:\${Math.max(2, box.y - 20)}px;padding:1px 5px;font:11px monospace;background:#0f172a;color:#fff;border-radius:4px;white-space:nowrap;\`;
          label.textContent = box.ref;
          root.appendChild(label);
        }
        document.documentElement.appendChild(root);
      })()`,
    });
  }

  private async clearOverlay(): Promise<void> {
    await this.send('Runtime.evaluate', {
      expression: `(() => { const el = document.getElementById(${JSON.stringify(OVERLAY_ELEMENT_ID)}); if (el) el.remove(); })()`,
    });
  }

  /** Current viewport as a JPEG data URL, for the pane's freeze image. */
  async captureFrame(quality: number): Promise<string> {
    const { data } = await this.send('Page.captureScreenshot', { format: 'jpeg', quality });
    return `data:image/jpeg;base64,${data as string}`;
  }

  async captureScreenshot(options: ScreenshotOptions): Promise<Screenshot> {
    if (options.annotated) {
      const snapshot = await this.getAccessibilitySnapshot();
      await this.renderRefOverlay(snapshot.nodes);
    }
    try {
      const metrics = await this.send('Page.getLayoutMetrics');
      const vp = metrics.cssLayoutViewport as {
        pageX: number;
        pageY: number;
        clientWidth: number;
        clientHeight: number;
      };
      const dprResult = await this.send('Runtime.evaluate', {
        expression: 'window.devicePixelRatio',
        returnByValue: true,
      });
      const dpr = Number(dprResult?.result?.value) || 1;
      const region = options.region ?? {
        x0: 0,
        y0: 0,
        x1: vp.clientWidth,
        y1: vp.clientHeight,
      };
      const width = Math.max(1, region.x1 - region.x0);
      const height = Math.max(1, region.y1 - region.y0);
      const capScale = Math.min(1, MAX_SCREENSHOT_WIDTH_PX / (width * dpr));
      const scale = capScale * Math.min(1, Math.max(0.1, options.scale ?? 1));
      const { data } = await this.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: vp.pageX + region.x0, y: vp.pageY + region.y0, width, height, scale },
      });
      return {
        buffer: Buffer.from(data as string, 'base64'),
        viewport: { width: vp.clientWidth, height: vp.clientHeight },
        scale,
      };
    } finally {
      if (options.annotated) await this.clearOverlay();
    }
  }
}

/** AX node ids of the subtree rooted at the node backing `backendNodeId`. */
function subtreeNodeIds(rawNodes: any[], backendNodeId: number): Set<string> {
  const byId = new Map<string, any>(rawNodes.map((n) => [n.nodeId, n]));
  const root = rawNodes.find((n) => n.backendDOMNodeId === backendNodeId);
  const ids = new Set<string>();
  if (!root) return ids;
  const stack: string[] = [root.nodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of byId.get(id)?.childIds ?? []) stack.push(child);
  }
  return ids;
}
