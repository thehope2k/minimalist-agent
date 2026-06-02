import { useState, useCallback } from 'react';
import type { GitRepo, GitFileEntry } from '../types';
import { applySelectedHunks } from '../git-util';
import { buildDiffContext } from '../git-generate';
import type { DiffCaches, PartialContentRefs } from './types';

/**
 * Manages commit message generation and commit execution.
 */
export function useCommitFlow(
  repos: GitRepo[],
  stagedPaths: Set<string>,
  stagedHunks: Map<string, Set<number>>,
  diffCaches: DiffCaches,
  partialContentRefs: PartialContentRefs,
  cwd: string | null,
  connectionSlug: string | undefined,
  model: string | undefined,
  sessionId: string | undefined,
  loadStatus: () => Promise<unknown>,
  clearPersisted: () => void,
) {
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const handleCommit = useCallback(
    async (message: string, amend: boolean) => {
      setCommitting(true);
      setCommitError(null);
      try {
        const byRepo = new Map<string, GitFileEntry[]>();
        for (const repo of repos) {
          const staged = repo.files.filter((f) => stagedPaths.has(f.absolutePath));
          if (staged.length > 0) byRepo.set(repo.root, staged);
        }

        for (const [repoRoot, files] of byRepo) {
          const result = await window.api.git.commitFiles({
            repoRoot,
            message,
            amend,
            files: files.map((f) => {
              const hs = stagedHunks.get(f.absolutePath);

              // No hunk state means "all hunks staged"
              if (!hs) {
                return {
                  relativePath: f.relativePath,
                  absolutePath: f.absolutePath,
                  status: f.status,
                  content: undefined,
                };
              }

              const fileDiff = diffCaches.diffs.get(f.absolutePath);
              const fileChanges = diffCaches.lineChanges.get(f.absolutePath) ?? [];
              const allStaged = hs.size >= fileChanges.length;

              const restoredPartial = partialContentRefs.restoredPartialContent.get(f.absolutePath);
              const content = allStaged
                ? undefined
                : fileDiff
                  ? applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, hs)
                  : restoredPartial;

              return {
                relativePath: f.relativePath,
                absolutePath: f.absolutePath,
                status: f.status,
                content,
              };
            }),
          });

          if (!result.ok) throw new Error(result.error ?? 'Commit failed');
        }

        clearPersisted();
        await loadStatus();
      } catch (e) {
        setCommitError(e instanceof Error ? e.message : String(e));
      } finally {
        setCommitting(false);
      }
    },
    [
      repos,
      stagedPaths,
      stagedHunks,
      diffCaches,
      partialContentRefs,
      loadStatus,
      clearPersisted,
    ],
  );

  const handleGenerateMessage = useCallback(
    async (amend: boolean, userContext?: string) => {
      if (!cwd) return null;
      const allFiles = repos.flatMap((r) => r.files);
      const staged = allFiles.filter((f) => stagedPaths.has(f.absolutePath));
      if (staged.length === 0) return null;

      // Resolve connection
      let slug = connectionSlug;
      let mdl = model;
      if (!slug) {
        const [defaultSlug, connections] = await Promise.all([
          window.api.connections.getDefaultSlug(),
          window.api.connections.list(),
        ]);
        const conn = connections.find((c) => c.slug === defaultSlug) ?? connections[0];
        if (!conn) return null;
        slug = conn.slug;
        mdl = mdl ?? conn.defaultModel;
      }

      const diffContext = await buildDiffContext({ repos, staged, cwd, amend });

      return window.api.git.generateCommitMessage({
        connectionSlug: slug,
        model: mdl ?? undefined,
        diffContext,
        userContext,
        sessionId: sessionId ?? undefined,
        cwd,
      });
    },
    [repos, stagedPaths, cwd, connectionSlug, model, sessionId],
  );

  const handleFetchLastMessage = useCallback(async () => {
    const repoRoot =
      repos.find((r) => r.files.some((f) => stagedPaths.has(f.absolutePath)))?.root ??
      repos[0]?.root ??
      cwd;
    if (!repoRoot) return null;
    return window.api.git.lastCommitMessage(repoRoot);
  }, [repos, stagedPaths, cwd]);

  return {
    committing,
    commitError,
    handleCommit,
    handleGenerateMessage,
    handleFetchLastMessage,
  };
}
