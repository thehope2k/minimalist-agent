import { ipcMain } from 'electron';
import { isWithinAllowedRoots, resolveWithinAllowedRoots } from '../files/path-guard';
import { createLogger } from '../logger';

const log = createLogger('ipc:git');

/** Git diff review (Cmd+G modal) and merge/conflict resolution IPC. */
export function registerGitIpc(): void {
  // ---- Git diff review (Cmd+G modal) ------------------------------------

  ipcMain.handle('git:status', async (_e, cwd: string) => {
    const { getGitStatus } = await import('../git/status');
    return getGitStatus(cwd);
  });

  ipcMain.handle(
    'git:diff',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; absolutePath: string; status: string },
    ) => {
      // Same C5 read-back class as fs:readFile: `git:diff` returns on-disk file
      // content to the renderer (status ?/A/M), so confine it to known roots.
      // The repo must be a known root, and the disk-read path is canonicalized
      // within roots (null for deleted files, where only HEAD content is used).
      const empty = { original: '', modified: '', language: 'plaintext' };
      if (!isWithinAllowedRoots(args.repoRoot)) return empty;
      const safeAbsolutePath = resolveWithinAllowedRoots(args.absolutePath) ?? '';
      const { getFileDiff } = await import('../git/diff');
      return getFileDiff(args.repoRoot, args.relativePath, safeAbsolutePath, args.status);
    },
  );

  ipcMain.handle(
    'git:commitFiles',
    async (
      _e,
      args: {
        repoRoot: string;
        files: Array<{ relativePath: string; absolutePath: string; status: string; content?: string }>;
        message: string;
        amend?: boolean;
      },
    ) => {
      const { commitFiles } = await import('../git/commit');
      return commitFiles(
        args.repoRoot,
        args.files as import('../git/commit').FileToCommit[],
        args.message,
        args.amend,
      );
    },
  );

  ipcMain.handle('git:lastCommitMessage', async (_e, repoRoot: string) => {
    const { getLastCommitMessage } = await import('../git/commit');
    return getLastCommitMessage(repoRoot);
  });

  ipcMain.handle('git:branchName', async (_e, repoRoot: string) => {
    const { getBranchName } = await import('../git/commit');
    return getBranchName(repoRoot);
  });

  ipcMain.handle('git:lastCommitFiles', async (_e, repoRoot: string) => {
    const { getLastCommitFiles } = await import('../git/commit');
    return getLastCommitFiles(repoRoot);
  });

  ipcMain.handle('git:lastCommitDiff', async (_e, repoRoot: string) => {
    const { getLastCommitDiff } = await import('../git/commit');
    return getLastCommitDiff(repoRoot);
  });

  ipcMain.handle(
    'git:generateCommitMessage',
    async (
      _e,
      args: { connectionSlug: string; model?: string; diffContext: string; userContext?: string; sessionId?: string; cwd?: string },
    ) => {
      try {
        const { resolveAuthForSlug } = await import('../auth/resolve');
        const { listConnections } = await import('../storage/connections');
        const { generateCommitMessage } = await import('../agent/commit-message');
        const auth = await resolveAuthForSlug(args.connectionSlug);
        const conn = listConnections().find((c) => c.slug === args.connectionSlug);
        return await generateCommitMessage({
          auth,
          diffContext: args.diffContext,
          userContext: args.userContext,
          model: args.model,
          connectionSlug: args.connectionSlug,
          chatSessionId: args.sessionId,
          piAuthProvider: conn?.piAuthProvider,
          cwd: args.cwd,
        });
      } catch (e) {
        log.error('generateCommitMessage:', e);
        return null;
      }
    },
  );

  // ---- Git merge / conflict resolution ------------------------------------

  ipcMain.handle('git:mergeState', async (_e, repoRoot: string) => {
    const { getMergeState } = await import('../git/merge');
    return getMergeState(repoRoot);
  });

  ipcMain.handle(
    'git:conflictContent',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; absolutePath: string },
    ) => {
      const { getConflictContent } = await import('../git/merge');
      return getConflictContent(args.repoRoot, args.relativePath, args.absolutePath);
    },
  );

  ipcMain.handle(
    'git:resolveConflict',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; absolutePath: string; content: string },
    ) => {
      const { resolveConflict } = await import('../git/merge');
      return resolveConflict(args.repoRoot, args.relativePath, args.absolutePath, args.content);
    },
  );

  ipcMain.handle(
    'git:abortOperation',
    async (_e, args: { repoRoot: string; type: string }) => {
      const { abortOperation } = await import('../git/merge');
      return abortOperation(
        args.repoRoot,
        args.type as import('../git/merge').MergeOperationType,
      );
    },
  );

  ipcMain.handle(
    'git:continueMerge',
    async (_e, args: { repoRoot: string; message: string; type: string }) => {
      const { continueMerge } = await import('../git/merge');
      return continueMerge(
        args.repoRoot,
        args.message,
        args.type as import('../git/merge').MergeOperationType,
      );
    },
  );
}
