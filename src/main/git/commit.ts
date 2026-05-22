// Git commit operations for the Cmd+G modal.
//
// Commit algorithm:
//   1. git reset HEAD           — clear index to HEAD (working tree untouched)
//   2. Per checked file:
//      - Unedited disk file     → git add --force <absolutePath>
//      - Monaco-edited content  → git hash-object -w <tmpFile>
//                                  → git update-index --cacheinfo <mode>,<sha>,<relPath>
//      - Deleted file           → git rm --cached --force <relPath>
//   3. git commit -m "<message>"
//
// Using hash-object + update-index instead of diff/patch avoids all the
// edge cases (CRLF, BOM, trailing newlines) that make git apply unreliable.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export interface FileToCommit {
  relativePath: string;
  absolutePath: string;
  /** Raw git status character: M, A, D, R, ? */
  status: string;
  /** If set, commit this content (Monaco-edited). Otherwise use the disk file. */
  content?: string;
}

export interface CommitResult {
  ok: boolean;
  error?: string;
}

async function getFileMode(absolutePath: string): Promise<string> {
  try {
    const s = await stat(absolutePath);
    // Executable bit: 0o111 covers user+group+other exec
    return (s.mode & 0o111) !== 0 ? '100755' : '100644';
  } catch {
    return '100644';
  }
}

async function hashAndStageContent(
  repoRoot: string,
  relativePath: string,
  absolutePath: string,
  content: string,
  isNew: boolean,
): Promise<void> {
  // Write to a temp file so git hash-object can read it as bytes.
  const tmpDir = await mkdtemp(join(tmpdir(), 'ma-git-'));
  const tmpFile = join(tmpDir, 'content');
  try {
    await writeFile(tmpFile, content, 'utf-8');
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'hash-object', '-w', tmpFile],
      { timeout: 10_000 },
    );
    const sha = stdout.trim();
    const mode = await getFileMode(absolutePath);
    const args = ['update-index'];
    if (isNew) args.push('--add');
    args.push('--cacheinfo', `${mode},${sha},${relativePath}`);
    await execFileAsync('git', ['-C', repoRoot, ...args], { timeout: 5_000 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/** Returns the current branch name for `repoRoot`, or null if detached/no commits. */
export async function getBranchName(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git', ['-C', repoRoot, 'branch', '--show-current'],
      { timeout: 5_000 },
    );
    return stdout.trim() || null;
  } catch { return null; }
}

/**
 * Returns the files changed in the last commit as a compact name-status string,
 * e.g. "M src/foo.ts\nA src/bar.ts". Used to give amend context to the AI.
 */
export async function getLastCommitFiles(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git', ['-C', repoRoot, 'show', 'HEAD', '--name-status', '--pretty=format:'],
      { timeout: 5_000 },
    );
    return stdout.trim() || null;
  } catch { return null; }
}

/**
 * Returns the unified diff of the last commit (what actually changed),
 * truncated to avoid overwhelming the AI context.
 */
export async function getLastCommitDiff(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'show', 'HEAD', '-p', '--pretty=format:', '--no-color', '-U2'],
      { timeout: 10_000, maxBuffer: 5 * 1024 * 1024 },
    );
    return stdout.trim() || null;
  } catch { return null; }
}

/** Returns the last commit message for `repoRoot`, or null if no commits. */
export async function getLastCommitMessage(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'log', '-1', '--format=%B'],
      { timeout: 5_000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function commitFiles(
  repoRoot: string,
  files: FileToCommit[],
  message: string,
  amend = false,
): Promise<CommitResult> {
  try {
    // 1. Clear index — start from HEAD state, working tree unchanged.
    //    Ignore errors here (nothing staged is fine).
    await execFileAsync('git', ['-C', repoRoot, 'reset', 'HEAD'], {
      timeout: 5_000,
    }).catch(() => null);

    // 2. Stage each file.
    for (const file of files) {
      const isNew = file.status === 'A' || file.status === '?';

      if (file.status === 'D') {
        // Deleted: remove from index.
        await execFileAsync(
          'git',
          ['-C', repoRoot, 'rm', '--cached', '--force', file.relativePath],
          { timeout: 5_000 },
        );
      } else if (file.content !== undefined) {
        // Monaco-edited content: stage exactly what the user trimmed.
        await hashAndStageContent(
          repoRoot,
          file.relativePath,
          file.absolutePath,
          file.content,
          isNew,
        );
      } else {
        // Unedited: stage the full disk file.
        await execFileAsync(
          'git',
          ['-C', repoRoot, 'add', '--force', file.absolutePath],
          { timeout: 10_000 },
        );
      }
    }

    // 3. Commit (or amend).
    const commitArgs = ['-C', repoRoot, 'commit', '--allow-empty-message'];
    if (amend) commitArgs.push('--amend');
    commitArgs.push('-m', message);
    await execFileAsync('git', commitArgs, { timeout: 15_000 });

    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Strip the node execFile wrapper noise — just return the git stderr.
    const match = raw.match(/stderr: ([\s\S]+)/);
    return { ok: false, error: match ? match[1].trim() : raw };
  }
}
