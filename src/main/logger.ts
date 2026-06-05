// Central logging layer for the main process.
//
// Wraps `electron-log` to give every module a small, leveled, namespaced
// logger via `createLogger('scope')`. The `[scope]` prefix convention that
// grew organically across the codebase (`[worktree]`, `[quota]`, …) is now
// formalized here.
//
// Behaviour:
//   - Console transport: `debug` in dev, `warn` in a packaged build
//     (debug/info progress noise never reaches a user's console). Override
//     with MA_LOG_LEVEL=debug|info|warn|error.
//   - File transport: always keeps `info`+ in a rotating file under
//     userData/logs so bug reports have history after DevTools closes.
//   - Uncaught exceptions / unhandled rejections are captured to the file.
//
// Never log secrets here — the codebase is currently clean of token/key/secret
// logging and must stay that way.

import log from 'electron-log/main';
import { app, shell } from 'electron';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { LogLevel, RendererLogRecord } from '../shared/log';
import { formatBindings, type Logger } from '../shared/log';

const VALID_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function resolveConsoleLevel(): LogLevel {
  const env = process.env.MA_LOG_LEVEL?.toLowerCase();
  if (env && (VALID_LEVELS as readonly string[]).includes(env)) {
    return env as LogLevel;
  }
  return app.isPackaged ? 'warn' : 'debug';
}

let logsDir = '';
let initialized = false;

/**
 * Wire up transports. Call once, early in `app.whenReady`, passing the
 * resolved logs directory (`Paths.logsDir()`).
 */
export function initLogging(dir: string): void {
  if (initialized) return;
  initialized = true;
  logsDir = dir;

  log.initialize();

  log.transports.console.level = resolveConsoleLevel();
  log.transports.console.format = '[{scope}] {text}';

  log.transports.file.level = 'info';
  log.transports.file.resolvePathFn = () => join(dir, 'main.log');
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB → rotates to main.old.log
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{scope}] {text}';

  log.errorHandler.startCatching({ showDialog: false });

  const boot = createLogger('logger');
  boot.info(`logging initialized (console=${log.transports.console.level}, file=info) at ${dir}`);
}

export type { Logger };

/**
 * Create a namespaced logger. The scope shows up as `[scope]` in both the
 * console and the on-disk file. Reuse the existing scope names when migrating
 * (`worktree`, `quota`, `pi-agent-tool`, …). Call `.child({ execId })` to bind
 * structured context to every subsequent line.
 */
export function createLogger(scope: string): Logger {
  return makeLogger(scope, {});
}

function makeLogger(scope: string, bindings: Record<string, unknown>): Logger {
  const scoped = log.scope(scope);
  const prefix = formatBindings(bindings);
  const wrap =
    (fn: (...a: unknown[]) => void) =>
    (...args: unknown[]) =>
      prefix ? fn(prefix, ...args) : fn(...args);
  return {
    debug: wrap((...a) => scoped.debug(...a)),
    info: wrap((...a) => scoped.info(...a)),
    warn: wrap((...a) => scoped.warn(...a)),
    error: wrap((...a) => scoped.error(...a)),
    child: (extra) => makeLogger(scope, { ...bindings, ...extra }),
  };
}

/** Persist a log line forwarded from the renderer process. */
export function recordRendererLog(record: RendererLogRecord): void {
  const scope = `${record.scope}:renderer`;
  const fn = createLogger(scope)[record.level] ?? createLogger(scope).info;
  fn(...record.parts);
}

/** Absolute path of the current log file. */
export function getLogFilePath(): string {
  return join(logsDir || app.getPath('userData'), 'logs', 'main.log');
}

/** Reveal the active log file in the OS file manager (for bug reports). */
export function revealLogFile(): void {
  shell.showItemInFolder(getLogFilePath());
}

/**
 * Return the tail of the log file as text (current + previous rotation),
 * newest content last. Used by the "Copy logs" affordance.
 */
export async function readRecentLogs(maxChars = 200_000): Promise<string> {
  const current = getLogFilePath();
  const previous = current.replace(/main\.log$/, 'main.old.log');
  const chunks: string[] = [];
  for (const file of [previous, current]) {
    try {
      chunks.push(await readFile(file, 'utf8'));
    } catch {
      // Missing rotation file is expected before the first rotation.
    }
  }
  const joined = chunks.join('');
  return joined.length > maxChars ? joined.slice(joined.length - maxChars) : joined;
}
