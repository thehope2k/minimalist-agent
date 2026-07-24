type Reporter = (operation: string | undefined) => void;

let current: string | undefined;
let reporter: Reporter | undefined;

export function initOperationTracker(onChange: Reporter): void {
  reporter = onChange;
}

export function reportOperation(operation: string | undefined): void {
  if (operation === current) return;
  current = operation;
  reporter?.(operation);
}

export async function withOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const previous = current;
  reportOperation(operation);
  try {
    return await fn();
  } finally {
    reportOperation(previous);
  }
}
