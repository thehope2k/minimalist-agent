import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { GitCommitResult } from '../../../../../shared/electron-api';
import type { GitRepo } from '../types';
import { resolveAmendRepoRoot } from '../git-util';
import { buildDiffContext } from '../git-generate';
import type { DiffCaches, PartialContentRefs } from './types';
import { emitPetEvent } from '@/lib/pet-events';
import { reconcileStagingAfterAttempt } from './commit-flow-state';
import { buildCommitFiles, groupStagedFiles, unexpectedCommitFailure } from './commit-flow-helpers';

export interface GitCommitAttempt {
  ok: boolean;
  outcomes: GitCommitResult[];
  notAttemptedRepoRoots: string[];
}

interface UseCommitFlowArgs {
  repos: GitRepo[];
  stagedPaths: Set<string>;
  setStagedPaths: Dispatch<SetStateAction<Set<string>>>;
  stagedHunks: Map<string, Set<number>>;
  setStagedHunks: Dispatch<SetStateAction<Map<string, Set<number>>>>;
  diffCaches: DiffCaches;
  partialContentRefs: PartialContentRefs;
  cwd: string | null;
  connectionSlug: string | undefined;
  model: string | undefined;
  sessionId: string | undefined;
  loadStatus: () => Promise<{ repos: GitRepo[]; error: string | null }>;
  clearPersisted: () => void;
}

export function useCommitFlow({
  repos,
  stagedPaths,
  setStagedPaths,
  stagedHunks,
  setStagedHunks,
  diffCaches,
  partialContentRefs,
  cwd,
  connectionSlug,
  model,
  sessionId,
  loadStatus,
  clearPersisted,
}: UseCommitFlowArgs) {
  const [committing, setCommitting] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<GitCommitAttempt | null>(null);
  const operationIdRef = useRef<string | null>(null);

  const handleCommit = useCallback(
    async (message: string, amend: boolean, skipHooks = false): Promise<GitCommitAttempt> => {
      setCommitting(true);
      setLastAttempt(null);
      const outcomes: GitCommitResult[] = [];
      const operationId = crypto.randomUUID();
      operationIdRef.current = operationId;
      const groupedFiles = groupStagedFiles(repos, stagedPaths);

      try {
        const preflightResults = await Promise.all(
          [...groupedFiles.keys()].map((repoRoot) => window.api.git.preflightCommit(repoRoot)),
        );
        const preflightFailure = preflightResults.find((result) => !result.ok);
        if (preflightFailure && !preflightFailure.ok) outcomes.push(preflightFailure);

        for (const [repoRoot, files] of preflightFailure ? [] : groupedFiles) {
          const result = await window.api.git.commitFiles({
            operationId,
            repoRoot,
            message,
            amend,
            skipHooks,
            files: buildCommitFiles(files, stagedHunks, diffCaches, partialContentRefs),
          });
          outcomes.push(result);
          if (!result.ok) break;
        }
      } catch (error) {
        const failedRepo = [...groupedFiles.keys()].find(
          (repoRoot) => !outcomes.some((outcome) => outcome.repoRoot === repoRoot),
        );
        outcomes.push(unexpectedCommitFailure(failedRepo ?? cwd ?? 'Unknown repository', error));
      } finally {
        operationIdRef.current = null;
        diffCaches.diffs.clear();
        diffCaches.lineChanges.clear();
        const refreshed = await loadStatus();
        const successfulRepoRoots = new Set(
          outcomes
            .filter((outcome) => outcome.ok || (!outcome.ok && outcome.commitCreated))
            .map((outcome) => outcome.repoRoot),
        );
        const reconciled = reconcileStagingAfterAttempt({
          stagedPaths,
          stagedHunks,
          repositoriesBefore: repos,
          repositoriesAfter: refreshed.repos,
          successfulRepoRoots,
        });
        setStagedPaths(reconciled.stagedPaths);
        setStagedHunks(reconciled.stagedHunks);
        setCommitting(false);
      }

      const attemptedRepoRoots = new Set(outcomes.map((outcome) => outcome.repoRoot));
      const attempt = {
        ok: outcomes.length > 0 && outcomes.every((outcome) => outcome.ok),
        outcomes,
        notAttemptedRepoRoots: [...groupedFiles.keys()].filter(
          (repoRoot) => !attemptedRepoRoots.has(repoRoot),
        ),
      };
      setLastAttempt(attempt);
      if (attempt.ok) {
        clearPersisted();
        emitPetEvent('commit-success');
      }
      return attempt;
    },
    [
      repos,
      stagedPaths,
      setStagedPaths,
      stagedHunks,
      setStagedHunks,
      diffCaches,
      partialContentRefs,
      loadStatus,
      clearPersisted,
      cwd,
    ],
  );

  const cancelCommit = useCallback(() => {
    const operationId = operationIdRef.current;
    if (operationId) void window.api.git.cancelCommit(operationId);
  }, []);

  const handleGenerateMessage = useCallback(
    async (amend: boolean, userContext?: string) => {
      if (!cwd) return null;
      const staged = repos
        .flatMap((repo) => repo.files)
        .filter((file) => stagedPaths.has(file.absolutePath));
      if (staged.length === 0) return null;

      let slug = connectionSlug;
      let selectedModel = model;
      if (!slug) {
        const [defaultSlug, connections] = await Promise.all([
          window.api.connections.getDefaultSlug(),
          window.api.connections.list(),
        ]);
        const connection = connections.find((item) => item.slug === defaultSlug) ?? connections[0];
        if (!connection) return null;
        slug = connection.slug;
        selectedModel = selectedModel ?? connection.defaultModel;
      }

      const diffContext = await buildDiffContext({ repos, staged, cwd, amend });
      return window.api.git.generateCommitMessage({
        connectionSlug: slug,
        model: selectedModel,
        diffContext,
        userContext,
        sessionId,
        cwd,
      });
    },
    [repos, stagedPaths, cwd, connectionSlug, model, sessionId],
  );

  const resolveRepoRoot = useCallback(
    () => resolveAmendRepoRoot(repos, stagedPaths, cwd),
    [repos, stagedPaths, cwd],
  );

  const handleFetchLastMessage = useCallback(async () => {
    const repoRoot = resolveRepoRoot();
    return repoRoot ? window.api.git.lastCommitMessage(repoRoot) : null;
  }, [resolveRepoRoot]);

  const handleFetchLastFiles = useCallback(async () => {
    const repoRoot = resolveRepoRoot();
    return repoRoot ? window.api.git.lastCommitFiles(repoRoot) : null;
  }, [resolveRepoRoot]);

  return {
    committing,
    lastAttempt,
    handleCommit,
    cancelCommit,
    handleGenerateMessage,
    handleFetchLastMessage,
    handleFetchLastFiles,
  };
}
