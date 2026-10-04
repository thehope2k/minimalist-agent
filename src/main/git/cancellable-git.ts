import { spawn } from 'node:child_process';

export interface CancellableGitOptions {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}

type ProcessFailure = Error & {
  code?: number | string;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  stdout?: string;
  stderr?: string;
};

function terminate(pid: number | undefined, fallback: () => void): void {
  if (pid === undefined || process.platform === 'win32') {
    fallback();
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    fallback();
  }
}

/**
 * Runs git in its own process group so cancelling or timing out also stops
 * hook children, which a plain SIGTERM to git alone leaves running.
 */
export function runCancellableGit(args: string[], options: CancellableGitOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      env: options.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let failure: ProcessFailure | null = null;

    const fail = (error: ProcessFailure) => {
      if (failure) return;
      failure = error;
      terminate(child.pid, () => child.kill('SIGTERM'));
    };
    const collect = (kind: 'stdout' | 'stderr') => (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > options.maxOutputBytes) {
        fail(
          Object.assign(new Error('stdout maxBuffer length exceeded'), {
            code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          }),
        );
        return;
      }
      if (kind === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    const onAbort = () =>
      fail(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
          code: 'ABORT_ERR',
        }),
      );
    const timeout = setTimeout(
      () =>
        fail(
          Object.assign(new Error('Command timed out'), {
            killed: true,
            signal: 'SIGTERM' as const,
          }),
        ),
      options.timeoutMs,
    );

    if (options.signal?.aborted) onAbort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.once('error', (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (failure) {
        reject(Object.assign(failure, { stdout, stderr }));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        Object.assign(new Error(`git exited with code ${code}`), {
          code: code ?? undefined,
          signal,
          stdout,
          stderr,
        }),
      );
    });
  });
}
