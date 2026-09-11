// Worktree functions - always use stubs (no worktrees for sub-agents).
// This simplifies the build and avoids electron import issues (the real
// worktree-manager.ts imports the electron-aware main logger, which cannot
// be loaded inside the pi-server subprocess). Main agent sessions get
// worktrees from a different code path if needed. See TODO.md for the
// re-enable plan and AGENTS.md for background.
import type { WorktreeResult } from './types';

export const createAgentWorktree = async (cwd: string, _execId: string): Promise<WorktreeResult> => ({
  path: cwd,
  branch: '',
  created: false,
});

export const removeAgentWorktree = async (_execId: string): Promise<void> => {};
export const cleanupAllWorktrees = async (): Promise<void> => {};
export const cleanupOrphanedWorktrees = async (_cwd: string, _daysOld: number): Promise<void> => {};
