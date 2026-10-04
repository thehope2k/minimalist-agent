import type { GitFileEntry, GitRepo } from '../types';

interface StagingState {
  stagedPaths: Set<string>;
  stagedHunks: Map<string, Set<number>>;
}

interface ReconcileStagingArgs extends StagingState {
  repositoriesBefore: GitRepo[];
  repositoriesAfter: GitRepo[];
  successfulRepoRoots: Set<string>;
}

export function shouldClearCommitDraft(attempt: {
  ok: boolean;
  outcomes: Array<{ ok: boolean; commitCreated?: boolean }>;
  notAttemptedRepoRoots: string[];
}): boolean {
  if (attempt.ok) return true;
  return (
    attempt.notAttemptedRepoRoots.length === 0 &&
    attempt.outcomes.some((outcome) => !outcome.ok && outcome.commitCreated === true)
  );
}

export function reconcileStagingAfterAttempt({
  stagedPaths,
  stagedHunks,
  repositoriesBefore,
  repositoriesAfter,
  successfulRepoRoots,
}: ReconcileStagingArgs): StagingState {
  const repositoryByPath = new Map<string, string>();
  for (const repository of repositoriesBefore) {
    for (const file of repository.files) repositoryByPath.set(file.absolutePath, repository.root);
  }

  const currentPaths = new Set(
    repositoriesAfter.flatMap((repository) =>
      repository.files.map((file: GitFileEntry) => file.absolutePath),
    ),
  );
  const nextPaths = new Set<string>();
  const nextHunks = new Map<string, Set<number>>();

  for (const path of stagedPaths) {
    const repositoryRoot = repositoryByPath.get(path);
    if (!currentPaths.has(path) || (repositoryRoot && successfulRepoRoots.has(repositoryRoot))) {
      continue;
    }
    nextPaths.add(path);
    const hunks = stagedHunks.get(path);
    if (hunks) nextHunks.set(path, hunks);
  }

  return { stagedPaths: nextPaths, stagedHunks: nextHunks };
}
