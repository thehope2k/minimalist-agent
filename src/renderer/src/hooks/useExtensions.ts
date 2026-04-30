import { useEffect, useState } from 'react';
import {
  bootstrap,
  snapshot as readSnapshot,
  subscribe,
} from '@/lib/extensions';
import type { LoadedExtension } from '@/lib/electron';

export function useExtensions(): LoadedExtension[] | null {
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
