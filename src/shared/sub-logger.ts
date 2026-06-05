// Subprocess-safe logger for code bundled into the pi-server child process.
//
// The pi-server bundle runs under ELECTRON_RUN_AS_NODE and MUST NOT import
// electron (see electron.vite.config.ts). So this logger has zero electron
// dependency. It writes to STDERR — never stdout, which is reserved for the
// JSONL protocol the parent reads. The parent pipes our stderr into the
// main-process log file, so these lines still end up on disk for bug reports.
//
// Level is controlled by MA_LOG_LEVEL (the parent sets it based on
// app.isPackaged); defaults to 'info' so debug noise is off unless asked for.

import { LOG_LEVEL_ORDER, formatBindings, type LogLevel, type Logger } from './log';

export type { Logger };

const VALID: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function activeLevel(): LogLevel {
  const env = process.env.MA_LOG_LEVEL?.toLowerCase();
  return env && (VALID as readonly string[]).includes(env) ? (env as LogLevel) : 'info';
}

function fmt(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[activeLevel()]) return;
  const line = `[${level}] [${scope}] ${args.map(fmt).join(' ')}\n`;
  process.stderr.write(line);
}

export function createLogger(scope: string): Logger {
  return makeLogger(scope, {});
}

function makeLogger(scope: string, bindings: Record<string, unknown>): Logger {
  const prefix = formatBindings(bindings);
  const pre = (args: unknown[]) => (prefix ? [prefix, ...args] : args);
  return {
    debug: (...args) => emit('debug', scope, pre(args)),
    info: (...args) => emit('info', scope, pre(args)),
    warn: (...args) => emit('warn', scope, pre(args)),
    error: (...args) => emit('error', scope, pre(args)),
    child: (extra) => makeLogger(scope, { ...bindings, ...extra }),
  };
}
