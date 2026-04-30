import { useEffect, useState } from 'react';
import {
  bootstrapPreferences,
  preferencesSnapshot,
  subscribePreferences,
} from '@/lib/preferences';

/**
 * Bootstraps the preferences store on first mount, then returns the
 * current preferences snapshot. Re-renders whenever preferences change.
 *
 * Returns `null` while loading.
 */
export function usePreferences() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bootstrapPreferences().then(() => {
      if (!cancelled) setReady(true);
    });
    const unsub = subscribePreferences(() => force((n) => n + 1));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!ready) return null;
  return preferencesSnapshot();
}
