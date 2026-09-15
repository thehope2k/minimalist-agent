import { useCallback } from 'react';
import { hunkKey } from '../git-review-state';
import type { GitFileEntry, LineChange } from '../types';
import type { PartialContentRefs } from './types';

interface UseHunkRestoreArgs {
  selected: GitFileEntry | null;
  stagedPaths: Set<string>;
  partialContentRefs: PartialContentRefs;
  pendingHunkRestoreRef: React.RefObject<Map<string, Set<string>>>;
  setCurrentChanges: React.Dispatch<React.SetStateAction<LineChange[]>>;
  setStagedPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStagedHunks: React.Dispatch<React.SetStateAction<Map<string, Set<number>>>>;
  setPendingPartialPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  lineChangesCache: Map<string, LineChange[]>;
}

export function useHunkRestore({
  selected,
  stagedPaths,
  partialContentRefs,
  pendingHunkRestoreRef,
  setCurrentChanges,
  setStagedPaths,
  setStagedHunks,
  setPendingPartialPaths,
  lineChangesCache,
}: UseHunkRestoreArgs) {
  const handleDiffComputed = useCallback(
    (changes: LineChange[]) => {
      setCurrentChanges(changes);
      if (!selected) return;

      const path = selected.absolutePath;
      lineChangesCache.set(path, changes);
      const pending = pendingHunkRestoreRef.current?.get(path);
      if (pending) {
        const selectedIndices = new Set<number>();
        changes.forEach((change, index) => {
          if (pending.has(hunkKey(change))) selectedIndices.add(index);
        });
        pendingHunkRestoreRef.current?.delete(path);
        setPendingPartialPaths((paths) => {
          const next = new Set(paths);
          next.delete(path);
          return next;
        });

        setStagedPaths((paths) => {
          const next = new Set(paths);
          if (selectedIndices.size > 0) next.add(path);
          else next.delete(path);
          return next;
        });
        setStagedHunks((hunks) => {
          const next = new Map(hunks);
          if (selectedIndices.size === 0) next.set(path, new Set());
          else if (selectedIndices.size === changes.length) next.delete(path);
          else next.set(path, selectedIndices);
          return next;
        });
        if (selectedIndices.size === changes.length) {
          partialContentRefs.restoredPartialContent.delete(path);
        }
        return;
      }

      setStagedHunks((hunks) => {
        if (hunks.has(path)) return hunks;
        const next = new Map(hunks);
        if (stagedPaths.has(path)) next.set(path, new Set(changes.map((_, index) => index)));
        else next.set(path, new Set());
        return next;
      });
    },
    [
      lineChangesCache,
      partialContentRefs.restoredPartialContent,
      pendingHunkRestoreRef,
      selected,
      setCurrentChanges,
      setPendingPartialPaths,
      setStagedHunks,
      setStagedPaths,
      stagedPaths,
    ],
  );

  return { handleDiffComputed };
}
