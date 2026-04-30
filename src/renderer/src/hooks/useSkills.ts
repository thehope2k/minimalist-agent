// Bootstraps + subscribes to the global skills list.
// Single tier — no project scoping in v1.

import { useEffect, useState } from 'react';
import {
  bootstrap,
  snapshot as readSnapshot,
  subscribe,
} from '@/lib/skills';
import type { LoadedSkill } from '@/lib/electron';

export function useSkills(): LoadedSkill[] | null {
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
