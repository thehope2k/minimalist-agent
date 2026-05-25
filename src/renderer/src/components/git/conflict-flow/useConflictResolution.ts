// Encapsulates the abort / continue-merge actions shown in the merge banner.
// Kept separate from useMergeState so components can subscribe to just the
// action state (loading, error) without re-rendering on every poll cycle.

import { useCallback, useState } from 'react';
import type { MergeOperationType } from '../types';

interface UseConflictResolutionArgs {
  onDone: () => void;
}

interface UseConflictResolutionReturn {
  aborting: boolean;
  continuing: boolean;
  actionError: string | null;
  abort: (repoRoot: string, type: MergeOperationType) => Promise<void>;
  continueMerge: (repoRoot: string, message: string, type: MergeOperationType) => Promise<void>;
  clearError: () => void;
}

export function useConflictResolution({
  onDone,
}: UseConflictResolutionArgs): UseConflictResolutionReturn {
  const [aborting, setAborting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const abort = useCallback(async (repoRoot: string, type: MergeOperationType) => {
    setAborting(true);
    setActionError(null);
    try {
      const result = await window.api.git.abortOperation({ repoRoot, type });
      if (!result.ok) throw new Error(result.error ?? 'Abort failed');
      onDone();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setAborting(false);
    }
  }, [onDone]);

  const continueMerge = useCallback(
    async (repoRoot: string, message: string, type: MergeOperationType) => {
      setContinuing(true);
      setActionError(null);
      try {
        const result = await window.api.git.continueMerge({ repoRoot, message, type });
        if (!result.ok) throw new Error(result.error ?? 'Continue merge failed');
        onDone();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      } finally {
        setContinuing(false);
      }
    },
    [onDone],
  );

  return {
    aborting,
    continuing,
    actionError,
    abort,
    continueMerge,
    clearError: () => setActionError(null),
  };
}
