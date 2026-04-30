import { useEffect, useState } from 'react';
import {
  bootstrap,
  snapshot as readSnapshot,
  subscribe,
} from '@/lib/connections';

/**
 * Bootstraps the connections+settings store on first mount, then returns
 * a snapshot that re-renders whenever any connection/setting changes.
 *
 * Returns `null` while loading. Components that need data should render a
 * loading state in that case (the AI panel does this).
 */
export function useAiData() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bootstrap().then(() => {
      if (!cancelled) setReady(true);
    });
    const unsub = subscribe(() => force((n) => n + 1));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!ready) return null;
  return readSnapshot();
}
