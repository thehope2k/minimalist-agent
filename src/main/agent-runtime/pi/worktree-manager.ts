// Git worktree isolation for parallel agent execution
//
// Each agent subprocess can run in its own isolated git worktree, preventing
// file-level resource contention (Maven locks, npm locks, git operations, etc.).
//
// Architecture:
// - Automatic worktree creation per agent execution
// - Support for .worktreeinclude config (gitignored file copying)
// - Graceful fallback for non-git repositories
// - Clean branch management and automatic cleanup

import { join, dirname } from 'path';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  statSync,
  readdirSync,
  appendFileSync,
  writeFileSync,
} from 'fs';
import type { Logger } from '../../../shared/log';
import { createWorktreeIncludeHelpers } from './worktree-includes';
import { execFileAsync, getBaseRef, getGitRoot, isGitRepository } from './worktree-git';

let configuredLogger: Logger | undefined;

/** Supply the logger for the process loading this Electron-free module. */
export function configureWorktreeLogger(logger: Logger): void {
  configuredLogger = logger;
}

function getLogger(): Logger {
  if (!configuredLogger) throw new Error('Worktree logger must be configured before use');
  return configuredLogger;
}

const log = new Proxy({} as Logger, {
  get: (_target, property) => Reflect.get(getLogger(), property),
});

/** Configuration for worktree behavior */
interface WorktreeOptions {
  /** Base branch to create worktree from ('fresh' = origin/HEAD, 'head' = current HEAD) */
  baseRef: 'fresh' | 'head';
  /** Whether worktrees are enabled (future setting) */
  enabled: boolean;
}

const DEFAULT_OPTIONS: WorktreeOptions = {
  baseRef: 'fresh',
  enabled: true,
};

/** Result of worktree creation */
export interface WorktreeResult {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name created for this worktree */
  branch: string;
  /** Whether a new worktree was created (false = fallback to original cwd) */
  created: boolean;
}

/** Cleanup metadata for a worktree */
interface WorktreeCleanupInfo {
  worktreePath: string;
  branch: string;
  baseCwd: string;
}

// Track created worktrees for cleanup
const worktreeRegistry = new Map<string, WorktreeCleanupInfo>();

// Track repos where we've already added .gitignore entry (avoid checking every time)
const gitignoreUpdatedRepos = new Set<string>();

/* ============================================================ */
/*  .gitignore auto-update                                      */
/* ============================================================ */

/**
 * Ensure .minimalist-agent/worktrees/ is in the project's .gitignore.
 * This prevents hundreds of untracked files from appearing in git status.
 */
async function ensureWorktreeInGitignore(gitRoot: string): Promise<void> {
  // Only check once per repo per app session
  if (gitignoreUpdatedRepos.has(gitRoot)) {
    return;
  }

  const gitignorePath = join(gitRoot, '.gitignore');
  const worktreePattern = '.minimalist-agent/worktrees/';

  try {
    let content = '';
    let needsUpdate = true;

    if (existsSync(gitignorePath)) {
      content = readFileSync(gitignorePath, 'utf-8');

      // Check if pattern already exists
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed === worktreePattern ||
          trimmed === worktreePattern.slice(0, -1) || // without trailing slash
          trimmed === '/.minimalist-agent/worktrees/' ||
          trimmed === '/.minimalist-agent/worktrees'
        ) {
          needsUpdate = false;
          break;
        }
      }
    }

    if (needsUpdate) {
      // Add the pattern
      const entry = `\n# Agent worktrees (Minimalist Agent)\n${worktreePattern}\n`;

      if (existsSync(gitignorePath)) {
        // Append to existing file
        const needsNewline = content.length > 0 && !content.endsWith('\n');
        appendFileSync(gitignorePath, (needsNewline ? '\n' : '') + entry);
      } else {
        // Create new .gitignore
        writeFileSync(gitignorePath, entry);
      }

      log.debug(`Added ${worktreePattern} to .gitignore`);
    }

    gitignoreUpdatedRepos.add(gitRoot);
  } catch (err) {
    log.warn('Failed to update .gitignore:', err);
    // Non-fatal - worktrees will still work, just show up in git status
  }
}

const { copyWorktreeIncludes } = createWorktreeIncludeHelpers(log);

/* ============================================================ */
/*  Worktree creation & management                              */
/* ============================================================ */

/**
 * Create an isolated git worktree for an agent execution.
 *
 * Returns the worktree path on success, or original cwd on fallback.
 */
export async function createAgentWorktree(
  baseCwd: string,
  execId: string,
  options: Partial<WorktreeOptions> = {},
): Promise<WorktreeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check if in git repository
  const isGit = await isGitRepository(baseCwd);
  if (!isGit) {
    log.debug(`${baseCwd} is not a git repository, using original CWD`);
    return {
      path: baseCwd,
      branch: '',
      created: false,
    };
  }

  try {
    const gitRoot = await getGitRoot(baseCwd);
    const worktreePath = join(gitRoot, '.minimalist-agent', 'worktrees', execId);
    const branchName = `agent/${execId}`;

    // Create worktrees directory if needed
    const worktreesDir = join(gitRoot, '.minimalist-agent', 'worktrees');
    if (!existsSync(worktreesDir)) {
      mkdirSync(worktreesDir, { recursive: true });
    }

    // Ensure .gitignore includes our worktrees directory
    await ensureWorktreeInGitignore(gitRoot);

    // Get base ref to branch from
    const baseRef = await getBaseRef(baseCwd, opts.baseRef, log);

    log.debug(`Creating worktree at ${worktreePath} from ${baseRef}`);

    // Create git worktree
    await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', branchName, baseRef], {
      cwd: gitRoot,
    });

    // Copy local config files
    await copyWorktreeIncludes(gitRoot, worktreePath);

    // Register for cleanup
    worktreeRegistry.set(execId, {
      worktreePath,
      branch: branchName,
      baseCwd: gitRoot,
    });

    log.debug(`Created worktree for ${execId}`);

    return {
      path: worktreePath,
      branch: branchName,
      created: true,
    };
  } catch (err) {
    log.error(`Failed to create worktree for ${execId}:`, err);
    log.debug(`Falling back to original CWD`);

    return {
      path: baseCwd,
      branch: '',
      created: false,
    };
  }
}

/**
 * Remove an agent worktree after execution completes.
 *
 * Cleanup policy:
 * - If worktree is clean (no changes, no commits) → remove immediately
 * - If worktree has changes or commits → keep for user review
 */
export async function removeAgentWorktree(execId: string): Promise<void> {
  const info = worktreeRegistry.get(execId);
  if (!info) {
    return; // Not a worktree execution
  }

  const { worktreePath, branch, baseCwd } = info;

  if (!existsSync(worktreePath)) {
    worktreeRegistry.delete(execId);
    return;
  }

  try {
    // Check if worktree has uncommitted changes
    const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
    });

    const hasUncommittedChanges = statusOutput.trim().length > 0;

    // Check if worktree has unpushed commits
    const { stdout: logOutput } = await execFileAsync(
      'git',
      ['log', `origin/${branch}..HEAD`, '--oneline'],
      { cwd: worktreePath },
    ).catch(() => ({ stdout: '' })); // Catch error if branch doesn't exist on remote

    const hasUnpushedCommits = logOutput.trim().length > 0;

    if (hasUncommittedChanges || hasUnpushedCommits) {
      log.debug(
        `Keeping ${execId} (has ${hasUncommittedChanges ? 'uncommitted changes' : ''}${hasUncommittedChanges && hasUnpushedCommits ? ' and ' : ''}${hasUnpushedCommits ? 'unpushed commits' : ''})`,
      );
      return;
    }

    // Clean worktree - remove it
    log.debug(`Removing clean worktree ${execId}`);

    await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: baseCwd });

    // Delete the branch
    await execFileAsync('git', ['branch', '-D', branch], { cwd: baseCwd });

    worktreeRegistry.delete(execId);
    log.debug(`Cleaned up ${execId}`);
  } catch (err) {
    log.warn(`Failed to cleanup ${execId}:`, err);
  }
}

/**
 * Cleanup all tracked worktrees (called on app shutdown).
 */
export async function cleanupAllWorktrees(): Promise<void> {
  log.debug(`Cleaning up ${worktreeRegistry.size} worktrees`);

  const promises = Array.from(worktreeRegistry.keys()).map((execId) => removeAgentWorktree(execId));

  await Promise.all(promises);
}

/**
 * Find and cleanup orphaned worktrees from previous sessions.
 * Called at app startup.
 */
export async function cleanupOrphanedWorktrees(baseCwd: string, maxAgeDays = 7): Promise<void> {
  const isGit = await isGitRepository(baseCwd);
  if (!isGit) return;

  try {
    const gitRoot = await getGitRoot(baseCwd);
    const worktreesDir = join(gitRoot, '.minimalist-agent', 'worktrees');

    if (!existsSync(worktreesDir)) return;

    log.debug('Scanning for orphaned worktrees...');

    const entries = readdirSync(worktreesDir, { withFileTypes: true });
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const worktreePath = join(worktreesDir, entry.name);
      const execId = entry.name;

      try {
        // Check age
        const stats = statSync(worktreePath);
        const age = now - stats.mtimeMs;

        if (age < maxAgeMs) {
          continue; // Too recent, keep it
        }

        // Check if clean
        const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: worktreePath,
        });

        if (statusOutput.trim().length > 0) {
          log.debug(`Keeping orphaned ${execId} (has changes)`);
          continue;
        }

        // Old and clean - remove it
        log.debug(`Removing orphaned worktree ${execId}`);

        await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
          cwd: gitRoot,
        });

        const branchName = `agent/${execId}`;
        await execFileAsync('git', ['branch', '-D', branchName], { cwd: gitRoot }).catch(() => {}); // Branch might not exist
      } catch (err) {
        log.warn(`Failed to cleanup orphaned ${execId}:`, err);
      }
    }
  } catch (err) {
    log.warn('Orphan cleanup failed:', err);
  }
}

/**
 * Check if worktree support is available (git is installed).
 */
export async function isWorktreeSupported(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}
