import { useEffect, useState } from 'react';
import type { ContentMatchEntry } from '@/lib/electron';
import { GREP_LIMIT, GREP_DEBOUNCE_MS } from './types';

export function useGrepSearch(cwd: string | undefined, query: string) {
  const [grepResults, setGrep] = useState<ContentMatchEntry[]>([]);
  const [grepLoading, setGrepLoad] = useState(false);

  useEffect(() => {
    if (!cwd || !query.trim()) {
      setGrep([]);
      setGrepLoad(false);
      return;
    }
    let cancelled = false;
    setGrepLoad(true);
    const t = window.setTimeout(() => {
      window.api.files
        .grep({ root: cwd, query: query.trim(), limit: GREP_LIMIT })
        .then((res) => {
          if (!cancelled) {
            setGrep(res);
            setGrepLoad(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGrep([]);
            setGrepLoad(false);
          }
        });
    }, GREP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [cwd, query]);

  return { grepResults, grepLoading };
}
