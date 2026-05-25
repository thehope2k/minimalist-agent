// Shared types for the git diff review modal (Cmd+G).
// These mirror the main-process types but live in the renderer so
// components can import them without a cross-process import.

import type * as MonacoType from 'monaco-editor';

/** Monaco line change — re-exported so components don't need a direct monaco-editor import. */
export type LineChange = MonacoType.editor.ILineChange;

export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | '?' | 'U';

export type MergeOperationType = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'none';

export interface RebaseProgress {
  current: number;
  total: number;
  commitMessage: string | null;
}

export interface MergeState {
  type: MergeOperationType;
  headLabel: string | null;
  incomingLabel: string | null;
  mergeMessage: string | null;
  conflictCount: number;
  rebaseProgress?: RebaseProgress;
}

export interface ConflictContent {
  base: string;
  ours: string;
  theirs: string;
  working: string;
  language: string;
}

export interface GitFileEntry {
  absolutePath: string;
  relativePath: string;
  status: GitFileStatus;
  repoRoot: string;
}

export interface GitRepo {
  root: string;
  files: GitFileEntry[];
}

export interface GitFileDiff {
  original: string;
  modified: string;
  language: string;
}

/** Per-file content edited in the Monaco modified pane. Key = absolutePath. */
export type EditedContents = Map<string, string>;
