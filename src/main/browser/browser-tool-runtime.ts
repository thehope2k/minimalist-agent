// Parses `browser_tool`'s CLI-style command string and dispatches to the
// session's BrowserPaneManager. One text command in, one text (+ optional
// image) result out — mirrors the shape Craft Agents' `browser_tool` uses,
// trimmed to the commands this app actually needs (see docs/BROWSER-TOOL.md
// for the deferred command list: click-at/drag, clipboard, upload, wait,
// network log).

import { browserPaneManager } from './browser-pane-manager';
import { MAX_SNAPSHOT_NODES, type AccessibilityNode } from './browser-cdp';

export interface BrowserToolCommandResult {
  output: string;
  imageBase64?: string;
  imageMimeType?: 'image/png' | 'image/jpeg';
}

const SCROLL_DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
const KEY_MODIFIERS = new Set(['shift', 'control', 'alt', 'meta']);
const CONSOLE_LEVELS = new Set(['log', 'info', 'warn', 'error']);
const DEFAULT_CONSOLE_LIMIT = 50;
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

function formatSnapshot(nodes: AccessibilityNode[], truncatedCount: number): string {
  if (nodes.length === 0) return '(no interactive or content elements found)';
  const body = nodes
    .map((n) => {
      const parts = [n.ref, n.role, JSON.stringify(n.name)];
      if (n.value !== undefined) parts.push(`value=${JSON.stringify(n.value)}`);
      if (n.disabled) parts.push('disabled');
      return parts.join(' ');
    })
    .join('\n');
  if (truncatedCount === 0) return body;
  return `${body}\n\n⚠ Truncated: showing ${nodes.length} of ${nodes.length + truncatedCount} matching elements — the rest were dropped by the ${MAX_SNAPSHOT_NODES}-node cap. Don't assume an element is absent just because it's not listed here; scroll or narrow the page state and re-run "snapshot" if you don't see what you expect.`;
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
          '  open                          — create/focus the session\'s browser window',
          '  navigate <url>',
          '  back / forward',
          '  snapshot                      — accessibility tree with @eN refs',
          '  click <ref>',
          '  fill <ref> <value>',
          '  select <ref> <value>          — <select> elements only',
          '  type <text>                  — types into the focused element',
          '  key <key> [modifier]          — modifier: shift|control|alt|meta',
          '  scroll <up|down|left|right> [amount]',
          '  screenshot [--annotated]',
          '  evaluate <js>',
          '  console [limit] [level]      — level: log|info|warn|error',
          '  release                      — hand control back to the user, keep window open',
          '  close                        — destroy the window',
        ].join('\n'),
      };
    }

    case 'open': {
      const state = browserPaneManager.ensureOpen(sessionId);
      return { output: `Browser window open. url=${state.url || '(blank)'} title=${JSON.stringify(state.title)}` };
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
      const snapshot = await browserPaneManager.snapshot(sessionId);
      return { output: `url=${snapshot.url}\ntitle=${JSON.stringify(snapshot.title)}\n\n${formatSnapshot(snapshot.nodes, snapshot.truncatedCount)}` };
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
      await browserPaneManager.key(sessionId, key, modifier ? [modifier as 'shift' | 'control' | 'alt' | 'meta'] : undefined);
      return { output: `Sent key ${key}${modifier ? `+${modifier}` : ''}.` };
    }

    case 'scroll': {
      const direction = requireArg(args[0], 'scroll <up|down|left|right> [amount]').toLowerCase();
      if (!SCROLL_DIRECTIONS.has(direction)) {
        throw new Error(`Unknown scroll direction "${direction}" — expected one of up|down|left|right.`);
      }
      const amount = args[1] !== undefined ? Number(args[1]) : undefined;
      if (amount !== undefined && !Number.isFinite(amount)) {
        throw new Error(`scroll amount must be a number, got "${args[1]}".`);
      }
      await browserPaneManager.scroll(sessionId, direction as 'up' | 'down' | 'left' | 'right', amount);
      return { output: `Scrolled ${direction}${amount !== undefined ? ` by ${amount}` : ''}.` };
    }

    case 'screenshot': {
      const annotated = args.includes('--annotated');
      const buffer = await browserPaneManager.screenshot(sessionId, { annotated });
      return {
        output: annotated ? 'Screenshot captured with @eN ref annotations.' : 'Screenshot captured.',
        imageBase64: buffer.toString('base64'),
        imageMimeType: 'image/png',
      };
    }

    case 'evaluate': {
      const expression = requireArg(args.join(' '), 'evaluate <js>');
      const value = await browserPaneManager.evaluate(sessionId, expression);
      const serialized = typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));
      if (serialized.length <= MAX_EVALUATE_OUTPUT_CHARS) return { output: serialized };
      const truncated = serialized.slice(0, MAX_EVALUATE_OUTPUT_CHARS);
      return { output: `${truncated}\n\n[... truncated; ${serialized.length - MAX_EVALUATE_OUTPUT_CHARS} more chars]` };
    }

    case 'console': {
      const limit = args[0] !== undefined ? Number(args[0]) : DEFAULT_CONSOLE_LIMIT;
      if (!Number.isFinite(limit)) throw new Error(`console limit must be a number, got "${args[0]}".`);
      const level = args[1]?.toLowerCase();
      if (level && !CONSOLE_LEVELS.has(level)) {
        throw new Error(`Unknown console level "${level}" — expected one of log|info|warn|error.`);
      }
      const entries = browserPaneManager.consoleLogs(sessionId, limit, level as 'log' | 'info' | 'warn' | 'error' | undefined);
      if (entries.length === 0) return { output: '(no console output captured)' };
      return { output: entries.map((e) => `[${e.level}] ${e.message}`).join('\n') };
    }

    case 'release': {
      const state = browserPaneManager.release(sessionId);
      return { output: `Control released back to the user. window ${state.open ? 'still open' : 'closed'}.` };
    }

    case 'close': {
      await browserPaneManager.close(sessionId);
      return { output: 'Browser window closed.' };
    }

    default:
      throw new Error(`Unknown browser_tool command "${verb}". Run "--help" for the command list.`);
  }
}
