// Shared helper for writing newline-delimited JSON to a child process's stdin.
//
// Both the main-process Pi backend (agent.ts) and the in-subprocess Agent tool
// (agent-tool.ts) spawn child processes and speak JSONL over stdin. This is the
// one writer for both. It's electron-free, so each bundle inlines its own copy
// (the pi-server bundle must not pull in electron).
//
// The liveness check + EPIPE/ERR_STREAM_DESTROYED swallowing handles the race
// where the child exits between our check and the actual write() during
// shutdown — that's expected, not an error worth surfacing.

import type { Writable } from 'node:stream';
import type { Logger } from './log';

function streamErrorCode(err: unknown): string | undefined {
  return (err as Error & { code?: string } | null)?.code;
}

function isShutdownRace(err: unknown): boolean {
  const code = streamErrorCode(err);
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED';
}

export function writeJsonLine(
  stdin: Writable | null | undefined,
  msg: unknown,
  log: Logger,
): void {
  if (!stdin) return;
  if (stdin.destroyed || stdin.writableEnded || !stdin.writable) return;

  const payload = JSON.stringify(msg) + '\n';
  try {
    stdin.write(payload, (err?: Error | null) => {
      if (!err || isShutdownRace(err)) return;
      log.warn('failed to write to subprocess stdin:', err.message);
    });
  } catch (e) {
    if (isShutdownRace(e)) return;
    throw e;
  }
}
