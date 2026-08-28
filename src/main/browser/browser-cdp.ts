// Chrome DevTools Protocol wrapper around one session's browser WebContents.
//
// Uses `webContents.debugger` (the same CDP transport Playwright/Stagehand
// use) so element interaction is ref-based and deterministic instead of
// blind coordinate guessing. Trimmed to the commands `browser_tool` actually
// exposes — see docs/BROWSER-TOOL.md for the full command list and the
// deferred commands (drag/click-at, clipboard, upload, wait, network log).

import type { WebContents } from 'electron';
import { createLogger } from '../logger';

const log = createLogger('browser-cdp');

const CDP_PROTOCOL_VERSION = '1.3';
export const MAX_SNAPSHOT_NODES = 300;
const IDLE_DETACH_MS = 5_000;
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
  'button', 'link', 'textbox', 'searchbox', 'combobox',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'treeitem',
]);

const CONTENT_ROLES = new Set([
  'heading', 'img', 'table', 'list', 'listitem',
  'paragraph', 'article', 'main', 'navigation', 'form',
  'alert', 'dialog', 'status',
]);

export interface AccessibilityNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
}

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
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private refToBackendNodeId = new Map<string, number>();
  private refDetails = new Map<string, { role: string; name: string }>();
  private backendNodeIdToRef = new Map<number, string>();
  private nextRefId = 0;
  private consoleLog: ConsoleLogEntry[] = [];

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    // Bound once: `.detach()` never removes listeners, and the debugger
    // re-attaches automatically after idle timeouts — binding inside
    // `ensureAttached()` would duplicate both listeners (and console entries)
    // on every reattach.
    this.webContents.debugger.on('detach', () => {
      this.attached = false;
    });
    this.webContents.debugger.on('message', (_event, method, params) => {
      if (method !== 'Runtime.consoleAPICalled') return;
      this.recordConsoleMessage(params as { type: string; args: Array<{ value?: unknown; description?: string }> });
    });
    // Backend node IDs die with the document, so this stable-ref table (kept
    // only so @eN doesn't renumber within one page) would otherwise grow
    // unbounded across navigations.
    this.webContents.on('did-navigate', () => {
      this.backendNodeIdToRef.clear();
      this.nextRefId = 0;
    });
  }

  private async ensureAttached(): Promise<void> {
    if (this.attached) return;
    try {
      this.webContents.debugger.attach(CDP_PROTOCOL_VERSION);
    } catch (err) {
      if (!String(err).includes('Already attached')) throw err;
    }
    this.attached = true;
    await this.send('Runtime.enable');
  }

  private recordConsoleMessage(params: { type: string; args: Array<{ value?: unknown; description?: string }> }): void {
    const level: ConsoleLogEntry['level'] =
      params.type === 'warning' ? 'warn' : params.type === 'error' ? 'error' : params.type === 'info' ? 'info' : 'log';
    const message = params.args.map((a) => normalize(a.value ?? a.description)).join(' ');
    this.consoleLog.push({ level, message, timestamp: Date.now() });
    if (this.consoleLog.length > MAX_CONSOLE_ENTRIES) this.consoleLog.shift();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.attached) this.detach();
    }, IDLE_DETACH_MS);
  }

  detach(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
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
    try {
      return await this.webContents.debugger.sendCommand(method, params);
    } finally {
      this.resetIdleTimer();
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

  async getAccessibilitySnapshot(): Promise<AccessibilitySnapshot> {
    const tree = await this.send('Accessibility.getFullAXTree');
    const rawNodes = Array.isArray(tree?.nodes) ? (tree.nodes as any[]) : [];

    this.refToBackendNodeId.clear();
    this.refDetails.clear();
    const nodes: AccessibilityNode[] = [];
    const seenBackendNodeIds = new Set<number>();
    let truncatedCount = 0;

    for (const rawNode of rawNodes) {
      const role = normalize(rawNode.role?.value).toLowerCase();
      const name = normalize(rawNode.name?.value);
      const rawValue = rawNode.value?.value;
      const value = rawValue !== undefined && rawValue !== '' ? String(rawValue) : undefined;
      const backendNodeId: number | undefined =
        typeof rawNode.backendDOMNodeId === 'number' ? rawNode.backendDOMNodeId : undefined;

      const isInteractive = INTERACTIVE_ROLES.has(role);
      const isNamedContent = CONTENT_ROLES.has(role) && !!name;
      const isMeaningful = isInteractive || isNamedContent || value !== undefined;
      if (!isMeaningful || backendNodeId === undefined) continue;
      if (seenBackendNodeIds.has(backendNodeId)) continue;
      seenBackendNodeIds.add(backendNodeId);

      if (nodes.length >= MAX_SNAPSHOT_NODES) {
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

    return { url: this.webContents.getURL(), title: this.webContents.getTitle(), nodes, truncatedCount };
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

  async clickElement(ref: string): Promise<void> {
    const backendNodeId = this.resolveBackendNodeId(ref);
    const { object } = await this.send('DOM.resolveNode', { backendNodeId });
    await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: 'function() { this.scrollIntoViewIfNeeded(); }',
    });
    const geometry = await this.getElementGeometry(ref);
    this.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(geometry.clickX), y: Math.round(geometry.clickY), button: 'left', clickCount: 1 });
    this.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(geometry.clickX), y: Math.round(geometry.clickY), button: 'left', clickCount: 1 });
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
    await this.typeText(value);
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
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', text: char, unmodifiedText: char });
    }
  }

  async sendKey(key: string, modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>): Promise<void> {
    const modifierBits =
      (modifiers?.includes('alt') ? CDP_MODIFIER_ALT : 0) |
      (modifiers?.includes('control') ? CDP_MODIFIER_CONTROL : 0) |
      (modifiers?.includes('meta') ? CDP_MODIFIER_META : 0) |
      (modifiers?.includes('shift') ? CDP_MODIFIER_SHIFT : 0);
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: key.length === 1 ? key.charCodeAt(0) : undefined, modifiers: modifierBits });
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
    const outcome = result?.result?.value as { ok?: boolean; reason?: string; actual?: string } | undefined;
    if (outcome && outcome.ok === false) {
      throw new Error(outcome.reason ?? `Select did not apply value "${value}" (actual: "${outcome.actual}")`);
    }
  }

  async scrollBy(deltaX: number, deltaY: number): Promise<void> {
    await this.send('Runtime.evaluate', { expression: `window.scrollBy(${deltaX}, ${deltaY})` });
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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

  async captureScreenshot(options: { annotated?: boolean }): Promise<Buffer> {
    if (options.annotated) {
      const snapshot = await this.getAccessibilitySnapshot();
      await this.renderRefOverlay(snapshot.nodes);
    }
    try {
      const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data as string, 'base64');
    } finally {
      if (options.annotated) await this.clearOverlay();
    }
  }
}
