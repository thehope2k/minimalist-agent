// Fetches and manages merge state for a set of repo roots.
// Polls periodically while a merge operation is active so the UI stays
// in sync as the user resolves conflicts in the terminal.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MergeState } from '../types';

const POLL_INTERVAL_MS = 3_000;

interface UseMergeStateArgs {
  repoRoots: string[];
  /** Skip fetching when no repos are loaded yet. */
  enabled: boolean;
}

interface UseMergeStateReturn {
  /** Map from repoRoot → MergeState. Empty until first fetch completes. */
  mergeStates: Map<string, MergeState>;
  /** True if any repo is in a non-idle merge operation. */
  inMergeOperation: boolean;
  /** Total unresolved conflicts across all repos. */
  totalConflicts: number;
  /** Force an immediate refresh (e.g. after resolving a conflict). */
  refresh: () => void;
}

export function useMergeState({ repoRoots, enabled }: UseMergeStateArgs): UseMergeStateReturn {
  const [mergeStates, setMergeStates] = useState<Map<string, MergeState>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetch = useCallback(async () => {
    if (!enabled || repoRoots.length === 0) return;
    try {
      const entries = await Promise.all(
        repoRoots.map(async (root) => {
          const state = await window.api.git.mergeState(root);
          return [root, state] as const;
        }),
      );
      if (mountedRef.current) {
        setMergeStates(new Map(entries));
      }
    } catch {
      // Network / IPC errors are transient — silently retry.
    }
  }, [enabled, repoRoots]);

  // Polling: only active when a merge operation is in progress.
  useEffect(() => {
    if (!enabled) return;

    void fetch();

    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        await fetch();
        if (mountedRef.current) schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetch, enabled]);

  const inMergeOperation = [...mergeStates.values()].some((s) => s.type !== 'none');
  const totalConflicts = [...mergeStates.values()].reduce((n, s) => n + s.conflictCount, 0);

  return { mergeStates, inMergeOperation, totalConflicts, refresh: fetch };
}
