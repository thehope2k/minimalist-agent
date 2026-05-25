import type { GitFileEntry, GitRepo, LineChange } from './types';

const STORAGE_KEY = 'git-review-state-v1';

interface PersistedFileState {
  absolutePath: string;
  relativePath: string;
  repoRoot: string;
  status: string;
  staged: boolean;
  /** Undefined means fully staged, array means explicitly selected hunk keys. */
  hunkKeys?: string[];
  /** Canonical staged content for partial selection fallback. */
  partialContent?: string;
}

export interface PersistedGitReviewState {
  version: 1;
  cwd: string;
  selectedPath: string | null;
  branches: Record<string, string | null>;
  files: PersistedFileState[];
  savedAt: number;
}

export interface RestorePlan {
  stagedPaths: Set<string>;
  stagedHunks: Map<string, Set<number>>;
  pendingHunkKeys: Map<string, Set<string>>;
  partialContents: Map<string, string>;
  selectedPath: string | null;
  restoredFull: number;
  restoredPartialPending: number;
  unstaged: number;
}

function readAll(): PersistedGitReviewState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedGitReviewState[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(states: PersistedGitReviewState[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states.slice(0, 20)));
  } catch {
    // Ignore quota/private mode failures.
  }
}

export function hunkKey(change: LineChange): string {
  return [
    change.originalStartLineNumber,
    change.originalEndLineNumber,
    change.modifiedStartLineNumber,
    change.modifiedEndLineNumber,
  ].join(':');
}

export function saveGitReviewState(state: PersistedGitReviewState): void {
  const all = readAll().filter((s) => s.cwd !== state.cwd);
  all.unshift(state);
  writeAll(all);
}

export function loadGitReviewState(cwd: string): PersistedGitReviewState | null {
  const all = readAll();
  return all.find((s) => s.cwd === cwd) ?? null;
}

/**
 * Restore prompt should appear only when the saved state differs from default
 * (default = all files staged, no partial hunk selection).
 */
export function hasMeaningfulReviewState(snapshot: PersistedGitReviewState): boolean {
  return snapshot.files.some((f) => !f.staged || (f.hunkKeys?.length ?? 0) > 0);
}

export function clearGitReviewState(cwd: string): void {
  writeAll(readAll().filter((s) => s.cwd !== cwd));
}

export function areBranchesCompatible(
  snapshot: PersistedGitReviewState,
  branches: Map<string, string | null>,
): boolean {
  const currentRoots = [...branches.keys()].sort();
  const snapshotRoots = Object.keys(snapshot.branches).sort();
  if (currentRoots.length !== snapshotRoots.length) return false;
  for (let i = 0; i < currentRoots.length; i++) {
    if (currentRoots[i] !== snapshotRoots[i]) return false;
  }
  for (const [root, branch] of branches) {
    if ((snapshot.branches[root] ?? null) !== (branch ?? null)) return false;
  }
  return true;
}

export function buildRestorePlan(
  snapshot: PersistedGitReviewState,
  allFiles: GitFileEntry[],
): RestorePlan {
  const byPath = new Map(snapshot.files.map((f) => [f.absolutePath, f]));
  const stagedPaths = new Set<string>();
  const stagedHunks = new Map<string, Set<number>>();
  const pendingHunkKeys = new Map<string, Set<string>>();
  const partialContents = new Map<string, string>();

  let restoredFull = 0;
  let restoredPartialPending = 0;
  let unstaged = 0;

  for (const file of allFiles) {
    const saved = byPath.get(file.absolutePath);
    if (!saved) {
      // New files not present in snapshot default to unstaged.
      stagedHunks.set(file.absolutePath, new Set());
      continue;
    }

    if (!saved.staged) {
      stagedHunks.set(file.absolutePath, new Set());
      unstaged++;
      continue;
    }

    if (saved.hunkKeys && saved.hunkKeys.length > 0) {
      stagedPaths.add(file.absolutePath);
      pendingHunkKeys.set(file.absolutePath, new Set(saved.hunkKeys));
      if (typeof saved.partialContent === 'string') {
        partialContents.set(file.absolutePath, saved.partialContent);
      }
      restoredPartialPending++;
      continue;
    }

    stagedPaths.add(file.absolutePath);
    restoredFull++;
  }

  return {
    stagedPaths,
    stagedHunks,
    pendingHunkKeys,
    partialContents,
    selectedPath: snapshot.selectedPath,
    restoredFull,
    restoredPartialPending,
    unstaged,
  };
}

export function buildPersistedState(args: {
  cwd: string;
  repos: GitRepo[];
  selectedPath: string | null;
  stagedPaths: Set<string>;
  stagedHunks: Map<string, Set<number>>;
  lineChangesByPath: Map<string, LineChange[]>;
  partialContentByPath: Map<string, string>;
  branches: Map<string, string | null>;
  /**
   * Hunk keys that are awaiting Monaco diff resolution (restored from a
   * previous session but not yet converted to indices). When present for a
   * file that is in `stagedPaths` but absent from `stagedHunks`, we use
   * these keys directly instead of writing `hunkKeys: undefined`, which
   * would incorrectly promote the file to "fully staged" on the next load.
   */
  pendingHunkKeys?: Map<string, Set<string>>;
}): PersistedGitReviewState {
  const {
    cwd,
    repos,
    selectedPath,
    stagedPaths,
    stagedHunks,
    lineChangesByPath,
    partialContentByPath,
    branches,
    pendingHunkKeys,
  } = args;

  const files: PersistedFileState[] = repos.flatMap((repo) =>
    repo.files.map((file) => {
      const staged = stagedPaths.has(file.absolutePath);
      const selectedIndices = stagedHunks.get(file.absolutePath);
      let hunkKeys: string[] | undefined;

      if (staged && selectedIndices) {
        const changes = lineChangesByPath.get(file.absolutePath) ?? [];
        hunkKeys = [...selectedIndices]
          .map((i) => changes[i])
          .filter((c): c is LineChange => Boolean(c))
          .map(hunkKey);
      } else if (staged && !selectedIndices) {
        // No entry in stagedHunks normally means "all hunks staged". But if
        // there are pending hunk keys for this file (Monaco hasn't resolved
        // them yet), preserve those keys so the partial selection survives
        // the save and is correctly restored on the next open.
        const pending = pendingHunkKeys?.get(file.absolutePath);
        if (pending && pending.size > 0) hunkKeys = [...pending];
      }

      return {
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        repoRoot: file.repoRoot,
        status: file.status,
        staged,
        hunkKeys,
        partialContent: staged ? partialContentByPath.get(file.absolutePath) : undefined,
      };
    }),
  );

  return {
    version: 1,
    cwd,
    selectedPath,
    branches: Object.fromEntries(branches),
    files,
    savedAt: Date.now(),
  };
}
