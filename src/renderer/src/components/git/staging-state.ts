import type { GitFileEntry, GitRepo } from './types';

export interface StageState {
  stagedPaths: Set<string>;
  stagedHunks: Map<string, Set<number>>;
}

function allHunkIndices(total: number): Set<number> {
  return new Set(Array.from({ length: total }, (_, i) => i));
}

export function toggleFileStage(state: StageState, file: GitFileEntry): StageState {
  const path = file.absolutePath;
  const stagedPaths = new Set(state.stagedPaths);
  const stagedHunks = new Map(state.stagedHunks);

  if (stagedPaths.has(path)) {
    stagedPaths.delete(path);
    stagedHunks.set(path, new Set());
  } else {
    stagedPaths.add(path);
    stagedHunks.delete(path);
  }

  return { stagedPaths, stagedHunks };
}

export function toggleRepoStage(state: StageState, repo: GitRepo): StageState {
  const stagedPaths = new Set(state.stagedPaths);
  const stagedHunks = new Map(state.stagedHunks);
  const allStaged = repo.files.every((f) => stagedPaths.has(f.absolutePath));

  for (const file of repo.files) {
    const path = file.absolutePath;
    if (allStaged) {
      stagedPaths.delete(path);
      stagedHunks.set(path, new Set());
    } else {
      stagedPaths.add(path);
      stagedHunks.delete(path);
    }
  }

  return { stagedPaths, stagedHunks };
}

export function toggleHunkStage(
  state: StageState,
  filePath: string,
  hunkIndex: number,
  totalHunks: number,
): StageState {
  if (totalHunks <= 0) return state;

  const stagedPaths = new Set(state.stagedPaths);
  const stagedHunks = new Map(state.stagedHunks);

  const current = stagedHunks.get(filePath) ?? allHunkIndices(totalHunks);
  const next = new Set(current);
  if (next.has(hunkIndex)) next.delete(hunkIndex);
  else next.add(hunkIndex);

  if (next.size === 0) stagedPaths.delete(filePath);
  else stagedPaths.add(filePath);

  if (next.size === totalHunks) stagedHunks.delete(filePath);
  else stagedHunks.set(filePath, next);

  return { stagedPaths, stagedHunks };
}

export function buildHunkStates(
  stagedPaths: Set<string>,
  stagedHunks: Map<string, Set<number>>,
  hunkTotalsByPath: Map<string, number>,
): Map<string, { staged: number; total: number }> {
  const map = new Map<string, { staged: number; total: number }>();

  for (const path of stagedPaths) {
    const total = hunkTotalsByPath.get(path);
    const indices = stagedHunks.get(path);
    if (!indices) {
      if (typeof total === 'number') map.set(path, { staged: total, total });
      continue;
    }
    map.set(path, {
      staged: indices.size,
      total: typeof total === 'number' ? total : indices.size,
    });
  }

  return map;
}
