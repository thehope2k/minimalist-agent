// Shared logging vocabulary used by both the main and renderer loggers.
// Keep this dependency-free so it can be imported from either process.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** A single renderer-originated log line forwarded to the main process. */
export interface RendererLogRecord {
  level: LogLevel;
  scope: string;
  /** Already-stringified args (renderer pre-serializes to stay structured-clone safe). */
  parts: string[];
}

/**
 * Shared logger shape implemented by both the main (electron-log) logger and
 * the subprocess sub-logger. `child()` returns a logger that prepends a set
 * of structured bindings (e.g. execId, sessionId) to every line, so logs
 * stay correlatable across the main/subprocess boundary.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** Render structured bindings as a compact `{k=v k2=v2}` prefix. */
export function formatBindings(bindings: Record<string, unknown>): string {
  const entries = Object.entries(bindings).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  const inner = entries
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return `{${inner}}`;
}
