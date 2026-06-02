import { useState, useCallback, useEffect } from 'react';
import type { GitRepo } from '../types';

/**
 * Loads git repository status (repos + files) and branch names.
 */
export function useGitStatus(cwd: string | null) {
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [branchesByRepo, setBranchesByRepo] = useState<Map<string, string | null>>(new Map());
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    if (!cwd) {
      setStatusError('no_cwd');
      setBranchesByRepo(new Map());
      setStatusLoading(false);
      return { repos: [], error: 'no_cwd' as const };
    }

    setStatusError(null);
    try {
      const result = await window.api.git.status(cwd);
      const newRepos = result.repos as GitRepo[];
      setRepos(newRepos);

      const branchEntries = await Promise.all(
        newRepos.map(async (r) => {
          try {
            return [r.root, await window.api.git.branchName(r.root)] as const;
          } catch {
            return [r.root, null] as const;
          }
        }),
      );
      setBranchesByRepo(new Map(branchEntries));

      if (result.error === 'no_git_repos') setStatusError('no_git_repos');
      else if (result.error) setStatusError(result.error);

      return { repos: newRepos, error: result.error ?? null };
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Failed to load status';
      setStatusError(err);
      return { repos: [], error: err };
    } finally {
      setStatusLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return {
    repos,
    branchesByRepo,
    statusError,
    statusLoading,
    loadStatus,
  };
}
