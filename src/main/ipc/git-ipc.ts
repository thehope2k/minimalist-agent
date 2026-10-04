import { ipcMain } from 'electron';
import { isWithinAllowedRoots, resolveWithinAllowedRoots } from '../files/path-guard';
import { isAbsolute, normalize } from 'node:path';
import type { GitCommitRequest, GitCommitResult } from '../../shared/electron-api';
import { createLogger } from '../logger';

const log = createLogger('ipc:git');
const pendingCommits = new Map<string, AbortController>();

function hasEscapingRelativePath(relativePath: string): boolean {
  const normalized = normalize(relativePath);
  return isAbsolute(normalized) || normalized.split(/[\\/]/)[0] === '..';
}

/** Returns a rejection reason, or null when the request stays inside known roots. */
export function findCommitRequestViolation(args: GitCommitRequest): string | null {
  if (!isWithinAllowedRoots(args.repoRoot))
    return 'Repository is outside the allowed workspace roots';
  for (const file of args.files) {
    if (hasEscapingRelativePath(file.relativePath)) return `Unsafe path: ${file.relativePath}`;
    // Deleted files have no on-disk path to canonicalize; update-index uses relativePath only.
    if (file.status !== 'D' && !resolveWithinAllowedRoots(file.absolutePath)) {
      return `File is outside the allowed workspace roots: ${file.relativePath}`;
    }
  }
  return null;
}

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

  ipcMain.handle('git:preflightCommit', async (_e, repoRoot: string) => {
    const { blockedCommitFailure, preflightCommit } = await import('../git/commit');
    if (!isWithinAllowedRoots(repoRoot)) {
      log.warn('Blocked git preflight outside allowed roots');
      return blockedCommitFailure(repoRoot, 'Repository is outside the allowed workspace roots');
    }
    return preflightCommit(repoRoot);
  });

  ipcMain.handle(
    'git:commitFiles',
    async (_e, args: GitCommitRequest): Promise<GitCommitResult> => {
      const { blockedCommitFailure, commitFiles } = await import('../git/commit');
      const violation = findCommitRequestViolation(args);
      if (violation) {
        log.warn(`Blocked git commit request: ${violation}`);
        return blockedCommitFailure(args.repoRoot, violation);
      }
      if (args.operationId && pendingCommits.has(args.operationId)) {
        return blockedCommitFailure(
          args.repoRoot,
          'A commit with this operation id is already running',
        );
      }
      const controller = new AbortController();
      if (args.operationId) pendingCommits.set(args.operationId, controller);
      try {
        const result = await commitFiles(args, controller.signal);
        if (!result.ok && result.kind === 'execution') {
          log.warn(`Git commit failed during ${result.phase} for ${result.repoRoot}`);
        }
        return result;
      } finally {
        if (args.operationId) pendingCommits.delete(args.operationId);
      }
    },
  );

  ipcMain.handle('git:cancelCommit', async (_e, operationId: string) => {
    pendingCommits.get(operationId)?.abort();
  });

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

  ipcMain.handle(
    'git:lastCommitFileDiff',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; oldPath?: string; status: string },
    ) => {
      const empty = { original: '', modified: '', language: 'plaintext' };
      // Read-back of committed content — same C5 concern as git:diff, confine to known roots.
      if (!isWithinAllowedRoots(args.repoRoot)) return empty;
      const { getCommitFileDiff } = await import('../git/diff');
      return getCommitFileDiff(args.repoRoot, args.relativePath, args.oldPath, args.status);
    },
  );

  ipcMain.handle('git:lastCommitDiff', async (_e, repoRoot: string) => {
    const { getLastCommitDiff } = await import('../git/commit');
    return getLastCommitDiff(repoRoot);
  });

  ipcMain.handle(
    'git:generateCommitMessage',
    async (
      _e,
      args: {
        connectionSlug: string;
        model?: string;
        diffContext: string;
        userContext?: string;
        sessionId?: string;
        cwd?: string;
      },
    ) => {
      try {
        const { resolveAuthForSlug } = await import('../auth/resolve');
        const { generateCommitMessage } = await import('../agent-runtime/commit-message');
        const { getCoAuthorPreference } = await import('../storage/preferences');
        const { findProjectForPath } = await import('../storage/projects');
        const auth = await resolveAuthForSlug(args.connectionSlug);
        const projectCoAuthor = args.cwd
          ? findProjectForPath(args.cwd)?.includeCoAuthoredBy
          : undefined;
        const includeCoAuthoredBy = projectCoAuthor ?? getCoAuthorPreference();
        return await generateCommitMessage({
          auth,
          diffContext: args.diffContext,
          userContext: args.userContext,
          model: args.model,
          connectionSlug: args.connectionSlug,
          chatSessionId: args.sessionId,
          cwd: args.cwd,
          includeCoAuthoredBy,
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
    async (_e, args: { repoRoot: string; relativePath: string; absolutePath: string }) => {
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

  ipcMain.handle('git:abortOperation', async (_e, args: { repoRoot: string; type: string }) => {
    const { abortOperation } = await import('../git/merge');
    return abortOperation(args.repoRoot, args.type as import('../git/merge').MergeOperationType);
  });

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
