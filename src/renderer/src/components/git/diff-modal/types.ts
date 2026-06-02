import type { GitFileEntry, GitFileDiff, GitRepo } from '../types';

export interface GitDiffModalProps {
  cwd: string | null;
  onClose: () => void;
  connectionSlug?: string;
  model?: string;
  /** Active session id — required for Copilot/Pi commit message generation. */
  sessionId?: string;
}

export interface DiffCaches {
  diffs: Map<string, GitFileDiff>;
  lineChanges: Map<string, import('../types').LineChange[]>;
}

export interface PartialContentRefs {
  pendingHunkKeys: Map<string, Set<string>>;
  restoredPartialContent: Map<string, string>;
}
