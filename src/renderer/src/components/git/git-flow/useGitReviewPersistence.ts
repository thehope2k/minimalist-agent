import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import {
  buildPersistedState,
  clearGitReviewState,
  saveGitReviewState,
} from '../git-review-state';
import type { GitFileEntry, GitRepo, LineChange } from '../types';

interface UseGitReviewPersistenceArgs {
  cwd: string | null;
  repos: GitRepo[];
  statusLoading: boolean;
  committing: boolean;
  selected: GitFileEntry | null;
  stagedPaths: Set<string>;
  stagedHunks: Map<string, Set<number>>;
  lineChangesByPath: Map<string, LineChange[]>;
  partialContentByPath: Map<string, string>;
  pendingHunkKeysRef: React.RefObject<Map<string, Set<string>>>;
}

export function useGitReviewPersistence({
  cwd,
  repos,
  statusLoading,
  committing,
  selected,
  stagedPaths,
  stagedHunks,
  lineChangesByPath,
  partialContentByPath,
  pendingHunkKeysRef,
}: UseGitReviewPersistenceArgs) {
  const branchByRepoRef = useRef<Map<string, string | null>>(new Map());

  const clearPersisted = useCallback(() => {
    if (!cwd) return;
    clearGitReviewState(cwd);
  }, [cwd]);

  useEffect(() => {
    if (!cwd || statusLoading || repos.length === 0 || committing) return;
    const snapshot = buildPersistedState({
      cwd,
      repos,
      selectedPath: selected?.absolutePath ?? null,
      stagedPaths,
      stagedHunks,
      lineChangesByPath,
      partialContentByPath,
      branches: branchByRepoRef.current,
      pendingHunkKeys: pendingHunkKeysRef.current ?? undefined,
    });
    saveGitReviewState(snapshot);
  }, [
    cwd,
    statusLoading,
    repos,
    selected,
    stagedPaths,
    stagedHunks,
    committing,
    lineChangesByPath,
    partialContentByPath,
  ]);

  return { clearPersisted };
}
