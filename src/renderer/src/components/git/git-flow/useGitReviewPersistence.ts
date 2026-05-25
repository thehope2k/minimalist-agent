import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import {
  areBranchesCompatible,
  buildPersistedState,
  clearGitReviewState,
  hasMeaningfulReviewState,
  loadGitReviewState,
  saveGitReviewState,
  type PersistedGitReviewState,
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
  onApplySnapshot: (snapshot: PersistedGitReviewState, repos: GitRepo[]) => void;
  /** Ref to the pending hunk-key map so saves can preserve partial selections while Monaco is still loading. */
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
  onApplySnapshot,
  pendingHunkKeysRef,
}: UseGitReviewPersistenceArgs) {
  const branchByRepoRef = useRef<Map<string, string | null>>(new Map());

  const onNoCwd = useCallback(() => {
    // no-op
  }, []);

  const prepareForRepos = useCallback(async (nextRepos: GitRepo[]) => {
    const branchEntries = await Promise.all(
      nextRepos.map(async (r) => [r.root, await window.api.git.branchName(r.root)] as const),
    );
    branchByRepoRef.current = new Map(branchEntries);

    if (!cwd) return;

    const persisted = loadGitReviewState(cwd);
    if (
      persisted
      && areBranchesCompatible(persisted, branchByRepoRef.current)
      && hasMeaningfulReviewState(persisted)
    ) {
      onApplySnapshot(persisted, nextRepos);
    }
  }, [cwd]);

  const restoreSnapshot = useCallback(() => {
    // no-op in auto-restore mode
  }, []);

  const startFresh = useCallback(() => {
    // no-op in auto-restore mode
  }, []);

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
      pendingHunkKeys: pendingHunkKeysRef.current,
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

  return {
    restoreCandidate: null as PersistedGitReviewState | null,
    restoreInfo: null as string | null,
    setRestoreInfo: (_: string | null) => {
      // no-op
    },
    onNoCwd,
    prepareForRepos,
    restoreSnapshot,
    startFresh,
    clearPersisted,
  };
}
