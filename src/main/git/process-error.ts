import type { GitCommitDiagnostics } from '../../shared/electron-api';

const MAX_DIAGNOSTIC_LENGTH = 100_000;

type ProcessFailure = Error & {
  code?: number | string;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

function readOutput(value: string | Buffer | undefined): string {
  if (!value) return '';
  return value.toString().trim().slice(-MAX_DIAGNOSTIC_LENGTH);
}

export function normalizeProcessFailure(error: unknown): GitCommitDiagnostics {
  if (!(error instanceof Error)) {
    return {
      stdout: '',
      stderr: String(error),
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: false,
      outputTooLarge: false,
    };
  }

  const failure = error as ProcessFailure;
  const exitCode = typeof failure.code === 'number' ? failure.code : null;
  const signal = failure.signal ?? null;
  const cancelled = failure.name === 'AbortError' || failure.code === 'ABORT_ERR';
  const outputTooLarge = failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
  const timedOut = !cancelled && !outputTooLarge && failure.killed === true && signal !== null;

  return {
    stdout: readOutput(failure.stdout),
    stderr: readOutput(failure.stderr) || failure.message,
    exitCode,
    signal,
    timedOut,
    cancelled,
    outputTooLarge,
  };
}
