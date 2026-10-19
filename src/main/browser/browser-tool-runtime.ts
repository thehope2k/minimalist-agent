// Parses `browser_tool`'s CLI-style command string and dispatches to the
// session's BrowserPaneManager. One text command in, one text (+ optional
// image) result out — mirrors the shape Craft Agents' `browser_tool` uses,
// trimmed to the commands this app actually needs (see docs/BROWSER-TOOL.md
// for the deferred command list: click-at/drag, clipboard, upload, wait).

import { browserPaneManager } from './browser-pane-manager';
import { MAX_SNAPSHOT_NODES, type AccessibilityNode, type ViewportOverride } from './browser-cdp';
import { formatNetworkEntry } from './browser-network-log';

export interface BrowserToolCommandResult {
  output: string;
  imageBase64?: string;
  imageMimeType?: 'image/png' | 'image/jpeg';
}

const SCROLL_DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
const KEY_MODIFIERS = new Set(['shift', 'control', 'alt', 'meta']);
const CONSOLE_LEVELS = new Set(['log', 'info', 'warn', 'error']);
const DEFAULT_CONSOLE_LIMIT = 50;
const DEFAULT_NETWORK_LIMIT = 50;
const VIEWPORT_PRESETS: Record<string, ViewportOverride> = {
  mobile: { width: 375, height: 812, mobile: true },
  tablet: { width: 768, height: 1024, mobile: true },
};
// Flags that take the following token as their value.
const VALUE_FLAGS = new Set(['within', 'max', 'scale', 'region', 'filter']);
// Same cap as web_fetch — evaluate is the one output path here with no
// built-in ceiling (snapshot caps nodes, console caps entries).
const MAX_EVALUATE_OUTPUT_CHARS = 60_000;

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

export function parseFlags(args: string[]): {
  positional: string[];
  flags: Map<string, string | true>;
} {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = args[++i];
      if (value === undefined) throw new Error(`--${name} needs a value.`);
      flags.set(name, value);
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

function numberFlag(flags: Map<string, string | true>, name: string): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (raw === true || !Number.isFinite(n)) throw new Error(`--${name} must be a number.`);
  return n;
}

export function parseRegion(raw: string): { x0: number; y0: number; x1: number; y1: number } {
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`--region must be "x0,y0,x1,y1" in viewport CSS pixels, got "${raw}".`);
  }
  const [x0, y0, x1, y1] = parts;
  if (x1 <= x0 || y1 <= y0) throw new Error('--region needs x1 > x0 and y1 > y0.');
  return { x0, y0, x1, y1 };
}

export function parseViewport(raw: string): ViewportOverride | null {
  const key = raw.toLowerCase();
  if (key === 'desktop' || key === 'reset') return null;
  const preset = VIEWPORT_PRESETS[key];
  if (preset) return preset;
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(key);
  if (!match) {
    throw new Error(`Unknown viewport "${raw}" — use mobile|tablet|desktop or WIDTHxHEIGHT.`);
  }
  return { width: Number(match[1]), height: Number(match[2]), mobile: false };
}

function truncate(text: string): string {
  if (text.length <= MAX_EVALUATE_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_EVALUATE_OUTPUT_CHARS)}\n\n[... truncated; ${text.length - MAX_EVALUATE_OUTPUT_CHARS} more chars]`;
}

function formatNodes(nodes: AccessibilityNode[]): string {
  return nodes
    .map((n) => {
      const parts = [n.ref, n.role, JSON.stringify(n.name)];
      if (n.value !== undefined) parts.push(`value=${JSON.stringify(n.value)}`);
      if (n.disabled) parts.push('disabled');
      return parts.join(' ');
    })
    .join('\n');
}

function formatSnapshot(nodes: AccessibilityNode[], truncatedCount: number): string {
  if (nodes.length === 0) return '(no interactive or content elements found)';
  const body = formatNodes(nodes);
  if (truncatedCount === 0) return body;
  return `${body}\n\n⚠ Truncated: showing ${nodes.length} of ${nodes.length + truncatedCount} matching elements. Don't assume an element is absent just because it's not listed; use "find <text>", "snapshot --within <ref>", or "snapshot --interactive" to narrow it.`;
}

function requireArg(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Missing argument. Usage: ${usage}`);
  return value;
}

export async function executeBrowserToolCommand(
  sessionId: string,
  rawCommand: string,
): Promise<BrowserToolCommandResult> {
  const [verb, ...args] = tokenize(rawCommand.trim());

  switch (verb) {
    case undefined:
    case '':
    case '--help':
    case 'help': {
      return {
        output: [
          'browser_tool commands:',
          "  open                          — create/focus the session's browser window",
          '  navigate <url>',
          '  back / forward',
          '  snapshot [--interactive] [--within <ref>] [--max <n>]',
          `                                — accessibility tree with @eN refs (max ${MAX_SNAPSHOT_NODES} nodes)`,
          '  find <text>                   — elements whose name/value contains <text>',
          "  text                          — readable text of the page's main content",
          '  click <ref>',
          '  fill <ref> <value>',
          '  select <ref> <value>          — <select> elements only',
          '  type <text>                  — types into the focused element',
          '  key <key> [modifier]          — modifier: shift|control|alt|meta',
          '  scroll <up|down|left|right> [amount]',
          '  screenshot [--annotated] [--scale 0.1-1] [--region x0,y0,x1,y1]',
          '  evaluate <js>',
          '  console [limit] [level]      — level: log|info|warn|error',
          '  network [limit] [--failed] [--filter <text>] [--all]',
          '                                — request log; --all includes images/fonts/css',
          '  viewport <mobile|tablet|desktop|WxH>',
          '  color-scheme <light|dark|auto>',
          '  release                      — hand control back to the user, keep window open',
          '  close                        — destroy the window',
        ].join('\n'),
      };
    }

    case 'open': {
      const state = browserPaneManager.ensureOpen(sessionId);
      return {
        output: `Browser window open. url=${state.url || '(blank)'} title=${JSON.stringify(state.title)}`,
      };
    }

    case 'navigate': {
      const url = requireArg(args[0], 'navigate <url>');
      const result = await browserPaneManager.navigate(sessionId, url);
      return { output: `Navigated to ${result.url} — ${JSON.stringify(result.title)}` };
    }

    case 'back':
      browserPaneManager.back(sessionId);
      return { output: 'Went back.' };

    case 'forward':
      browserPaneManager.forward(sessionId);
      return { output: 'Went forward.' };

    case 'snapshot': {
      const { flags } = parseFlags(args);
      const within = flags.get('within');
      const snapshot = await browserPaneManager.snapshot(sessionId, {
        interactiveOnly: flags.has('interactive'),
        within: typeof within === 'string' ? within : undefined,
        maxNodes: numberFlag(flags, 'max'),
      });
      return {
        output: `url=${snapshot.url}\ntitle=${JSON.stringify(snapshot.title)}\n\n${formatSnapshot(snapshot.nodes, snapshot.truncatedCount)}`,
      };
    }

    case 'find': {
      const query = requireArg(args.join(' '), 'find <text>');
      const { nodes, truncatedCount } = await browserPaneManager.snapshot(sessionId, { query });
      if (nodes.length === 0) return { output: `No elements matching ${JSON.stringify(query)}.` };
      const more = truncatedCount > 0 ? `\n\n(+${truncatedCount} more — refine the text)` : '';
      return { output: `${formatNodes(nodes)}${more}` };
    }

    case 'text': {
      const text = await browserPaneManager.pageText(sessionId);
      return { output: text.trim() ? truncate(text) : '(page has no visible text)' };
    }

    case 'network': {
      const { positional, flags } = parseFlags(args);
      const limit = positional[0] !== undefined ? Number(positional[0]) : DEFAULT_NETWORK_LIMIT;
      if (!Number.isFinite(limit)) {
        throw new Error(`network limit must be a number, got "${positional[0]}".`);
      }
      const filter = flags.get('filter');
      const entries = browserPaneManager.network(sessionId, {
        limit,
        failedOnly: flags.has('failed'),
        filter: typeof filter === 'string' ? filter : undefined,
        includeStatic: flags.has('all'),
      });
      if (entries.length === 0) return { output: '(no matching requests captured)' };
      return { output: entries.map(formatNetworkEntry).join('\n') };
    }

    case 'viewport': {
      const raw = requireArg(args[0], 'viewport <mobile|tablet|desktop|WxH>');
      const viewport = parseViewport(raw);
      await browserPaneManager.setViewport(sessionId, viewport);
      return {
        output: viewport
          ? `Viewport emulated at ${viewport.width}×${viewport.height}${viewport.mobile ? ' (mobile, touch)' : ''}.`
          : 'Viewport emulation cleared.',
      };
    }

    case 'color-scheme': {
      const raw = requireArg(args[0], 'color-scheme <light|dark|auto>').toLowerCase();
      if (raw !== 'light' && raw !== 'dark' && raw !== 'auto') {
        throw new Error(`Unknown color scheme "${raw}" — expected light|dark|auto.`);
      }
      await browserPaneManager.setColorScheme(sessionId, raw === 'auto' ? null : raw);
      return {
        output:
          raw === 'auto'
            ? 'Color scheme emulation cleared.'
            : `Emulating prefers-color-scheme: ${raw}.`,
      };
    }

    case 'click': {
      const ref = requireArg(args[0], 'click <ref>');
      await browserPaneManager.click(sessionId, ref);
      return { output: `Clicked ${ref}.` };
    }

    case 'fill': {
      const ref = requireArg(args[0], 'fill <ref> <value>');
      const value = args.slice(1).join(' ');
      await browserPaneManager.fill(sessionId, ref, value);
      return { output: `Filled ${ref} with ${JSON.stringify(value)}.` };
    }

    case 'select': {
      const ref = requireArg(args[0], 'select <ref> <value>');
      const value = requireArg(args.slice(1).join(' '), 'select <ref> <value>');
      await browserPaneManager.select(sessionId, ref, value);
      return { output: `Selected ${JSON.stringify(value)} in ${ref}.` };
    }

    case 'type': {
      const text = requireArg(args.join(' '), 'type <text>');
      await browserPaneManager.type(sessionId, text);
      return { output: `Typed ${JSON.stringify(text)} into the focused element.` };
    }

    case 'key': {
      const key = requireArg(args[0], 'key <key> [modifier]');
      const modifier = args[1]?.toLowerCase();
      if (modifier && !KEY_MODIFIERS.has(modifier)) {
        throw new Error(`Unknown modifier "${modifier}" — expected one of shift|control|alt|meta.`);
      }
      await browserPaneManager.key(
        sessionId,
        key,
        modifier ? [modifier as 'shift' | 'control' | 'alt' | 'meta'] : undefined,
      );
      return { output: `Sent key ${key}${modifier ? `+${modifier}` : ''}.` };
    }

    case 'scroll': {
      const direction = requireArg(args[0], 'scroll <up|down|left|right> [amount]').toLowerCase();
      if (!SCROLL_DIRECTIONS.has(direction)) {
        throw new Error(
          `Unknown scroll direction "${direction}" — expected one of up|down|left|right.`,
        );
      }
      const amount = args[1] !== undefined ? Number(args[1]) : undefined;
      if (amount !== undefined && !Number.isFinite(amount)) {
        throw new Error(`scroll amount must be a number, got "${args[1]}".`);
      }
      await browserPaneManager.scroll(
        sessionId,
        direction as 'up' | 'down' | 'left' | 'right',
        amount,
      );
      return { output: `Scrolled ${direction}${amount !== undefined ? ` by ${amount}` : ''}.` };
    }

    case 'screenshot': {
      const { flags } = parseFlags(args);
      const annotated = flags.has('annotated');
      const region = flags.get('region');
      const shot = await browserPaneManager.screenshot(sessionId, {
        annotated,
        scale: numberFlag(flags, 'scale'),
        region: typeof region === 'string' ? parseRegion(region) : undefined,
      });
      const what = annotated
        ? 'Screenshot captured with @eN ref annotations'
        : 'Screenshot captured';
      return {
        output: `${what} (viewport ${shot.viewport.width}×${shot.viewport.height} CSS px, scale ${shot.scale.toFixed(2)}; --region uses viewport CSS px).`,
        imageBase64: shot.buffer.toString('base64'),
        imageMimeType: 'image/png',
      };
    }

    case 'evaluate': {
      const expression = requireArg(args.join(' '), 'evaluate <js>');
      const value = await browserPaneManager.evaluate(sessionId, expression);
      const serialized =
        typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));
      return { output: truncate(serialized) };
    }

    case 'console': {
      const limit = args[0] !== undefined ? Number(args[0]) : DEFAULT_CONSOLE_LIMIT;
      if (!Number.isFinite(limit))
        throw new Error(`console limit must be a number, got "${args[0]}".`);
      const level = args[1]?.toLowerCase();
      if (level && !CONSOLE_LEVELS.has(level)) {
        throw new Error(`Unknown console level "${level}" — expected one of log|info|warn|error.`);
      }
      const entries = browserPaneManager.consoleLogs(
        sessionId,
        limit,
        level as 'log' | 'info' | 'warn' | 'error' | undefined,
      );
      if (entries.length === 0) return { output: '(no console output captured)' };
      return { output: entries.map((e) => `[${e.level}] ${e.message}`).join('\n') };
    }

    case 'release': {
      const state = browserPaneManager.release(sessionId);
      return {
        output: `Control released back to the user. window ${state.open ? 'still open' : 'closed'}.`,
      };
    }

    case 'close': {
      await browserPaneManager.close(sessionId);
      return { output: 'Browser window closed.' };
    }

    default:
      throw new Error(`Unknown browser_tool command "${verb}". Run "--help" for the command list.`);
  }
}
