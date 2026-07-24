/** Rejects with a labeled timeout error after `ms` if `promise` hasn't settled.
 *  Does not cancel `promise` — use `withDeadline` when the callee accepts an
 *  AbortSignal and can actually stop. */
export class DeadlineExceededError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'DeadlineExceededError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceededError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Rejects as soon as `signal` aborts, otherwise settles with `promise`. Does
 *  not cancel `promise` — only stops the caller from waiting on it. */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('Aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

interface DeadlineOptions {
  ceilingMs: number;
  label: string;
  parentSignal?: AbortSignal;
}

/**
 * Runs `fn` with an owned `AbortSignal` that fires when `ceilingMs` elapses or
 * `parentSignal` aborts, whichever comes first. `fn` must plug the signal into
 * whatever it awaits (`fetch(url, { signal })`, a child call) for this to stop
 * the underlying work rather than merely abandon it.
 */
export async function withDeadline<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  { ceilingMs, label, parentSignal }: DeadlineOptions,
): Promise<T> {
  if (parentSignal?.aborted) throw new Error('Aborted');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ceilingMs);
  const onParentAbort = () => ctrl.abort();
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    return await fn(ctrl.signal);
  } catch (error) {
    if (!ctrl.signal.aborted) throw error;
    throw timedOut ? new DeadlineExceededError(label, ceilingMs) : new Error('Aborted');
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
