import type { GitCommitFailure, GitCommitFile } from '../../../../../shared/electron-api';
import type { GitFileEntry, GitRepo } from '../types';
import { applySelectedHunks } from '../git-util';
import type { DiffCaches, PartialContentRefs } from './types';

export function unexpectedCommitFailure(repoRoot: string, error: unknown): GitCommitFailure {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    repoRoot,
    phase: 'commit',
    kind: 'execution',
    summary: 'Commit request failed unexpectedly',
    diagnostics: {
      stdout: '',
      stderr: message,
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: false,
      outputTooLarge: false,
    },
    workingTreeChanged: false,
    commitCreated: false,
  };
}

export function groupStagedFiles(
  repos: GitRepo[],
  stagedPaths: Set<string>,
): Map<string, GitFileEntry[]> {
  const grouped = new Map<string, GitFileEntry[]>();
  for (const repo of repos) {
    const files = repo.files.filter((file) => stagedPaths.has(file.absolutePath));
    if (files.length > 0) grouped.set(repo.root, files);
  }
  return grouped;
}

export function buildCommitFiles(
  files: GitFileEntry[],
  stagedHunks: Map<string, Set<number>>,
  diffCaches: DiffCaches,
  partialContentRefs: PartialContentRefs,
): GitCommitFile[] {
  return files.map((file) => {
    const selectedHunks = stagedHunks.get(file.absolutePath);
    if (!selectedHunks) {
      return {
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        status: file.status,
      };
    }

    const fileDiff = diffCaches.diffs.get(file.absolutePath);
    const fileChanges = diffCaches.lineChanges.get(file.absolutePath) ?? [];
    const allStaged = selectedHunks.size >= fileChanges.length;
    const restoredContent = partialContentRefs.restoredPartialContent.get(file.absolutePath);
    const content = allStaged
      ? undefined
      : fileDiff
        ? applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, selectedHunks)
        : restoredContent;

    return {
      relativePath: file.relativePath,
      absolutePath: file.absolutePath,
      status: file.status,
      content,
    };
  });
}
