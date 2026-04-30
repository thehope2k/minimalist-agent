import { useEffect, useState } from 'react';
import {
  bootstrap,
  snapshot as readSnapshot,
  subscribe,
} from '@/lib/sessions';
import type { SessionSummary } from '@/lib/electron';

/**
 * Bootstraps + subscribes to the session list. Returns null while loading.
 */
export function useSessions(): SessionSummary[] | null {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    bootstrap()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // On IPC failure fall through to an empty list rather than staying
        // stuck in "Loading…" forever. cache will be null so snapshot would
        // throw — we guard against that below.
        if (!cancelled) setReady(true);
      });

    const unsub = subscribe(() => {
      // reload() always updates cache *before* calling notify(), so cache
      // is guaranteed to be populated here. Unblocking ready lets the list
      // appear even if bootstrap's .then() hasn't fired yet (e.g. a fresh
      // session created while the initial IPC round-trip was still in flight).
      if (!cancelled) setReady(true);
      force((n) => n + 1);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!ready) return null;
  try {
    return readSnapshot();
  } catch {
    // Cache not yet populated (bootstrap failed before any reload fired).
    return [];
  }
}
