import { useCallback, useState, type MutableRefObject } from 'react';
import { applySelectedHunks } from '../git-util';
import type { GitFileDiff, GitRepo, LineChange } from '../types';

interface UseGitCommitArgs {
  repos: GitRepo[];
  stagedPaths: Set<string>;
  stagedHunks: Map<string, Set<number>>;
  diffCacheRef: MutableRefObject<Map<string, GitFileDiff>>;
  lineChangesCacheRef: MutableRefObject<Map<string, LineChange[]>>;
  onAfterCommit: () => Promise<void>;
}

export function useGitCommit({
  repos,
  stagedPaths,
  stagedHunks,
  diffCacheRef,
  lineChangesCacheRef,
  onAfterCommit,
}: UseGitCommitArgs) {
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const commit = useCallback(async (message: string, amend: boolean) => {
    setCommitting(true);
    setCommitError(null);
    try {
      const byRepo = new Map<string, GitRepo['files']>();
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
            if (!hs) {
              return {
                relativePath: f.relativePath,
                absolutePath: f.absolutePath,
                status: f.status,
                content: undefined,
              };
            }

            const fileDiff = diffCacheRef.current.get(f.absolutePath);
            const fileChanges = lineChangesCacheRef.current.get(f.absolutePath) ?? [];
            const allStaged = hs.size >= fileChanges.length;

            const content = allStaged || !fileDiff
              ? undefined
              : applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, hs);

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

      await onAfterCommit();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [repos, stagedPaths, stagedHunks, diffCacheRef, lineChangesCacheRef, onAfterCommit]);

  return {
    committing,
    commitError,
    commit,
  };
}
