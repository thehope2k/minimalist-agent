import { useEffect, useState } from 'react';
import {
  bootstrap,
  snapshot as readSnapshot,
  subscribe,
} from '@/lib/projects';
import type { Project } from '@/lib/electron';

/**
 * Bootstraps + subscribes to the project list. Returns null while loading.
 */
export function useProjects(): Project[] | null {
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
