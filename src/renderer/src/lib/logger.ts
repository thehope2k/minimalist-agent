// Renderer-side logger mirroring the main-process API (`createLogger('scope')`).
//
// Routing:
//   - debug / info → DevTools console only, and only in dev builds. These are
//     development noise and must not run in production.
//   - warn / error → always shown in the console AND forwarded to the main
//     process so they land in the on-disk log file (userData/logs/main.log).
//     This closes the "logs vanish with the DevTools session" support gap.
//
// Keep the `[scope]` prefix convention consistent with the main logger.

import type { LogLevel } from '../../../shared/log';

const isDev = import.meta.env.DEV;

/** Best-effort, structured-clone-safe stringification of a log arg. */
function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function forward(level: LogLevel, scope: string, args: unknown[]): void {
  try {
    window.api?.logs?.write({ level, scope, parts: args.map(stringify) });
  } catch {
    // Never let logging throw into product code.
  }
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

function bindingsPrefix(bindings: Record<string, unknown>): string {
  const entries = Object.entries(bindings).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return `{${entries
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')}}`;
}

export function createLogger(scope: string): Logger {
  return makeLogger(scope, {});
}

function makeLogger(scope: string, bindings: Record<string, unknown>): Logger {
  const prefix = `[${scope}]`;
  const bind = bindingsPrefix(bindings);
  const pre = (args: unknown[]) => (bind ? [bind, ...args] : args);
  return {
    debug: (...args) => {
      if (isDev) console.debug(prefix, ...pre(args));
    },
    info: (...args) => {
      if (isDev) console.info(prefix, ...pre(args));
    },
    warn: (...args) => {
      console.warn(prefix, ...pre(args));
      forward('warn', scope, pre(args));
    },
    error: (...args) => {
      console.error(prefix, ...pre(args));
      forward('error', scope, pre(args));
    },
    child: (extra) => makeLogger(scope, { ...bindings, ...extra }),
  };
}
