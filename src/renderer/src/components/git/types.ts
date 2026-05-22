// Shared types for the git diff review modal (Cmd+G).
// These mirror the main-process types but live in the renderer so
// components can import them without a cross-process import.

export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | '?';

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
