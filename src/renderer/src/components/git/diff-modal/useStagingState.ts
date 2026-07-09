import { useState, useCallback, useMemo } from 'react';
import type { GitRepo, GitFileEntry, LineChange } from '../types';
import { buildHunkStates, toggleFileStage, toggleHunkStage, toggleRepoStage } from '../staging-state';
import type { PartialContentRefs } from './types';

/**
 * Manages file-level and hunk-level staging state.
 */
export function useStagingState(
  lineChangesCacheRef: React.RefObject<Map<string, LineChange[]>>,
  partialContentRefs: PartialContentRefs,
) {
  // File-level staging: all files staged by default
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(new Set());

  // Hunk-level staging per file. Key = absolutePath, value = Set of staged hunk indices.
  const [stagedHunks, setStagedHunks] = useState<Map<string, Set<number>>>(new Map());

  // Paths with pending hunk restore (diff not yet loaded)
  const [pendingPartialPaths, setPendingPartialPaths] = useState<Set<string>>(new Set());

  const handleToggleFile = useCallback((file: GitFileEntry) => {
    const next = toggleFileStage({ stagedPaths, stagedHunks }, file);
    setStagedPaths(next.stagedPaths);
    setStagedHunks(next.stagedHunks);

    if (!next.stagedPaths.has(file.absolutePath) || !next.stagedHunks.has(file.absolutePath)) {
      partialContentRefs.restoredPartialContent.delete(file.absolutePath);
    }
  }, [stagedPaths, stagedHunks, partialContentRefs.restoredPartialContent]);

  const handleToggleRepo = useCallback((repo: GitRepo) => {
    const next = toggleRepoStage({ stagedPaths, stagedHunks }, repo);
    setStagedPaths(next.stagedPaths);
    setStagedHunks(next.stagedHunks);

    for (const f of repo.files) {
      if (!next.stagedPaths.has(f.absolutePath) || !next.stagedHunks.has(f.absolutePath)) {
        partialContentRefs.restoredPartialContent.delete(f.absolutePath);
      }
    }
  }, [stagedPaths, stagedHunks, partialContentRefs.restoredPartialContent]);

  const handleToggleHunk = useCallback(
    (selected: GitFileEntry | null, hunkIndex: number, totalHunkCount: number) => {
      if (!selected) return;
      const next = toggleHunkStage(
        { stagedPaths, stagedHunks },
        selected.absolutePath,
        hunkIndex,
        totalHunkCount,
      );
      setStagedPaths(next.stagedPaths);
      setStagedHunks(next.stagedHunks);

      const path = selected.absolutePath;
      const hs = next.stagedHunks.get(path);
      if (!hs || hs.size === 0 || hs.size >= totalHunkCount) {
        partialContentRefs.restoredPartialContent.delete(path);
      }
    },
    [stagedPaths, stagedHunks, partialContentRefs.restoredPartialContent],
  );

  // Derive hunk state map for file list indeterminate display
  const hunkStates = useMemo(() => {
    const hunkTotalsByPath = new Map<string, number>();
    for (const [path, changes] of lineChangesCacheRef.current) {
      hunkTotalsByPath.set(path, changes.length);
    }
    const map = buildHunkStates(stagedPaths, stagedHunks, hunkTotalsByPath);

    // Files with pending hunk restore show as indeterminate
    for (const path of pendingPartialPaths) {
      if (!map.has(path)) map.set(path, { staged: 1, total: 2 });
    }
    return map;
  }, [stagedPaths, stagedHunks, pendingPartialPaths, lineChangesCacheRef]);

  return {
    stagedPaths,
    setStagedPaths,
    stagedHunks,
    setStagedHunks,
    setPendingPartialPaths,
    handleToggleFile,
    handleToggleRepo,
    handleToggleHunk,
    hunkStates,
  };
}
