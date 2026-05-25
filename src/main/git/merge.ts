// Merge / rebase / cherry-pick state detection and conflict resolution.
//
// Design notes:
//   - State is detected by inspecting .git/ sentinel files — faster than
//     parsing `git status` and correct on all git versions.
//   - Three-way conflict content comes from the object store stages:
//       :1:<path>  common base
//       :2:<path>  ours  (HEAD)
//       :3:<path>  theirs (MERGE_HEAD / incoming)
//   - Resolution writes caller-supplied content to disk then runs `git add`
//     to mark the file resolved.
//   - continueMerge() dispatches to the correct git sub-command so the same
//     code path handles merge, rebase, and cherry-pick.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MergeOperationType = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'none';

/**
 * Rebase-specific progress — only populated when type === 'rebase'.
 * Comes from .git/rebase-merge/{msgnum,end,message}.
 */
export interface RebaseProgress {
  /** 1-indexed number of the commit currently being replayed. */
  current: number;
  /** Total commits in the rebase sequence. */
  total: number;
  /** Subject line of the commit currently being replayed. Null if unreadable. */
  commitMessage: string | null;
}

export interface MergeState {
  type: MergeOperationType;
  /** Current branch (HEAD). Null on detached HEAD. */
  headLabel: string | null;
  /** Incoming branch / SHA label being merged in. */
  incomingLabel: string | null;
  /** Pre-written commit message from .git/MERGE_MSG. */
  mergeMessage: string | null;
  /** Number of files still carrying conflict markers (UU / AA / DD etc.). */
  conflictCount: number;
  /** Only present when type === 'rebase'. */
  rebaseProgress?: RebaseProgress;
}

export interface ConflictContent {
  /** Common ancestor — git stage 1. Empty string if no common base. */
  base: string;
  /** Our changes — git stage 2 (HEAD). */
  ours: string;
  /** Their changes — git stage 3 (MERGE_HEAD / incoming). */
  theirs: string;
  /** Current working copy content — may contain conflict markers. */
  working: string;
  /** Monaco language id derived from the file extension. */
  language: string;
}

export interface OperationResult {
  ok: boolean;
  error?: string;
  /** True once all conflict files in this repo are resolved. */
  allResolved?: boolean;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readGitFile(repoRoot: string, name: string): Promise<string | null> {
  try {
    return (await readFile(join(repoRoot, '.git', name), 'utf-8')).trim();
  } catch {
    return null;
  }
}

async function getStageContent(
  repoRoot: string,
  relativePath: string,
  stage: 1 | 2 | 3,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'show', `:${stage}:${relativePath}`],
      { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return '';
  }
}

async function nameRev(repoRoot: string, sha: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'name-rev', '--name-only', sha],
      { timeout: 5_000 },
    );
    return stdout.trim() || sha.slice(0, 8);
  } catch {
    return sha.slice(0, 8);
  }
}

async function countConflicts(repoRoot: string): Promise<number> {
  const CONFLICT_XY = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'status', '--porcelain', '-u'],
      { timeout: 10_000 },
    );
    return stdout
      .split('\n')
      .filter((l) => CONFLICT_XY.has(l.slice(0, 2)))
      .length;
  } catch {
    return 0;
  }
}

const EXT_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cs': 'csharp',
  '.php': 'php', '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'ini',
  '.md': 'markdown', '.mdx': 'markdown', '.sh': 'shell', '.bash': 'shell',
  '.xml': 'xml', '.sql': 'sql', '.graphql': 'graphql', '.proto': 'proto',
};

function detectLanguage(relativePath: string): string {
  const name = basename(relativePath).toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
  return EXT_LANGUAGE[extname(relativePath).toLowerCase()] ?? 'plaintext';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether the repo is currently in a merge / rebase / cherry-pick /
 * revert operation. Returns `type: 'none'` when the working tree is clean.
 */
export async function getMergeState(repoRoot: string): Promise<MergeState> {
  const [
    mergeHead,
    cherryPickHead,
    revertHead,
    hasRebaseMerge,
    hasRebaseApply,
    mergeMsg,
    headBranch,
  ] = await Promise.all([
    readGitFile(repoRoot, 'MERGE_HEAD'),
    readGitFile(repoRoot, 'CHERRY_PICK_HEAD'),
    readGitFile(repoRoot, 'REVERT_HEAD'),
    fileExists(join(repoRoot, '.git', 'rebase-merge')),
    fileExists(join(repoRoot, '.git', 'rebase-apply', 'head-name')),
    readGitFile(repoRoot, 'MERGE_MSG'),
    execFileAsync('git', ['-C', repoRoot, 'branch', '--show-current'], { timeout: 5_000 })
      .then(({ stdout }) => stdout.trim() || null)
      .catch(() => null),
  ]);

  const conflictCount = await countConflicts(repoRoot);

  if (mergeHead) {
    const incomingLabel = await nameRev(repoRoot, mergeHead);
    return { type: 'merge', headLabel: headBranch, incomingLabel, mergeMessage: mergeMsg, conflictCount };
  }

  if (hasRebaseMerge || hasRebaseApply) {
    const onto =
      (await readGitFile(repoRoot, 'rebase-merge/onto')) ??
      (await readGitFile(repoRoot, 'rebase-apply/onto'));
    const incomingLabel = onto ? await nameRev(repoRoot, onto) : null;

    // Read rebase progress — .git/rebase-merge/{msgnum, end, message}
    // msgnum is the 1-indexed current commit; end is the total.
    const [msgnumRaw, endRaw, rebaseMsg] = await Promise.all([
      readGitFile(repoRoot, 'rebase-merge/msgnum') ??
        readGitFile(repoRoot, 'rebase-apply/next'),
      readGitFile(repoRoot, 'rebase-merge/end') ??
        readGitFile(repoRoot, 'rebase-apply/last'),
      readGitFile(repoRoot, 'rebase-merge/message'),
    ]);

    let rebaseProgress: RebaseProgress | undefined;
    const current = msgnumRaw ? parseInt(msgnumRaw, 10) : NaN;
    const total   = endRaw    ? parseInt(endRaw,    10) : NaN;
    if (!isNaN(current) && !isNaN(total) && total > 0) {
      // Only take the subject line (first non-empty line).
      const commitMessage = rebaseMsg
        ? rebaseMsg.split('\n').find((l) => l.trim().length > 0) ?? null
        : null;
      rebaseProgress = { current, total, commitMessage };
    }

    return { type: 'rebase', headLabel: headBranch, incomingLabel, mergeMessage: mergeMsg, conflictCount, rebaseProgress };
  }

  if (cherryPickHead) {
    const incomingLabel = await nameRev(repoRoot, cherryPickHead);
    return { type: 'cherry-pick', headLabel: headBranch, incomingLabel, mergeMessage: mergeMsg, conflictCount };
  }

  if (revertHead) {
    const incomingLabel = await nameRev(repoRoot, revertHead);
    return { type: 'revert', headLabel: headBranch, incomingLabel, mergeMessage: mergeMsg, conflictCount };
  }

  return { type: 'none', headLabel: headBranch, incomingLabel: null, mergeMessage: null, conflictCount: 0 };
}

/**
 * Retrieve the three-way content for a file that is currently in conflict.
 * Returns empty strings for stages that do not exist (e.g. add/add conflict
 * has no base).
 */
export async function getConflictContent(
  repoRoot: string,
  relativePath: string,
  absolutePath: string,
): Promise<ConflictContent> {
  const [base, ours, theirs, working] = await Promise.all([
    getStageContent(repoRoot, relativePath, 1),
    getStageContent(repoRoot, relativePath, 2),
    getStageContent(repoRoot, relativePath, 3),
    readFile(absolutePath, 'utf-8').catch(() => ''),
  ]);

  return { base, ours, theirs, working, language: detectLanguage(relativePath) };
}

/**
 * Write resolved content to disk and stage the file to mark the conflict
 * resolved (`git add`). Returns `allResolved: true` when no conflict files
 * remain in this repo.
 */
export async function resolveConflict(
  repoRoot: string,
  relativePath: string,
  absolutePath: string,
  resolvedContent: string,
): Promise<OperationResult> {
  try {
    await writeFile(absolutePath, resolvedContent, 'utf-8');
    await execFileAsync('git', ['-C', repoRoot, 'add', '--', relativePath], { timeout: 10_000 });
    const remaining = await countConflicts(repoRoot);
    return { ok: true, allResolved: remaining === 0 };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const match = raw.match(/stderr: ([\s\S]+)/);
    return { ok: false, error: match ? match[1].trim() : raw };
  }
}

/**
 * Abort the ongoing operation. Dispatches to the correct git sub-command
 * based on the operation type.
 */
export async function abortOperation(
  repoRoot: string,
  type: MergeOperationType,
): Promise<OperationResult> {
  const args =
    type === 'rebase'        ? ['rebase', '--abort'] :
    type === 'cherry-pick'   ? ['cherry-pick', '--abort'] :
    type === 'revert'        ? ['revert', '--abort'] :
    /* merge / fallback */     ['merge', '--abort'];
  try {
    await execFileAsync('git', ['-C', repoRoot, ...args], { timeout: 15_000 });
    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const match = raw.match(/stderr: ([\s\S]+)/);
    return { ok: false, error: match ? match[1].trim() : raw };
  }
}

/**
 * Complete the ongoing merge / cherry-pick / revert by committing.
 * For rebase, runs `git rebase --continue` (which commits automatically).
 * All conflict files must be staged (`git add`ed) before calling this.
 */
export async function continueMerge(
  repoRoot: string,
  message: string,
  type: MergeOperationType,
): Promise<OperationResult> {
  try {
    if (type === 'rebase') {
      await execFileAsync(
        'git',
        ['-C', repoRoot, 'rebase', '--continue'],
        { timeout: 30_000, env: { ...process.env, GIT_EDITOR: 'true' } },
      );
    } else if (type === 'cherry-pick') {
      await execFileAsync(
        'git',
        ['-C', repoRoot, 'cherry-pick', '--continue'],
        { timeout: 30_000, env: { ...process.env, GIT_EDITOR: 'true' } },
      );
    } else {
      // merge / revert — explicit commit
      await execFileAsync(
        'git',
        ['-C', repoRoot, 'commit', '--no-edit', '-m', message],
        { timeout: 30_000 },
      );
    }
    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const match = raw.match(/stderr: ([\s\S]+)/);
    return { ok: false, error: match ? match[1].trim() : raw };
  }
}
