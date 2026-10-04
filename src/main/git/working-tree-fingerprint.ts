import { lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const LIST_TIMEOUT_MS = 30_000;

export type WorkingTreeSnapshot = Map<string, string>;

function listPaths(repoRoot: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['-C', repoRoot, 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => child.kill('SIGTERM'), LIST_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`git ls-files exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8').split('\0').filter(Boolean));
    });
  });
}

async function describeFile(repoRoot: string, relativePath: string): Promise<string> {
  try {
    const file = await lstat(join(repoRoot, relativePath));
    return `${file.mode}:${file.size}:${file.mtimeMs}`;
  } catch {
    return 'missing';
  }
}

async function describePaths(
  repoRoot: string,
  paths: Iterable<string>,
): Promise<WorkingTreeSnapshot> {
  const snapshot: WorkingTreeSnapshot = new Map();
  for (const path of paths) snapshot.set(path, await describeFile(repoRoot, path));
  return snapshot;
}

/** Index-independent: only on-disk metadata of files that were dirty or untracked at the start. */
export async function tryCaptureWorkingTree(repoRoot: string): Promise<WorkingTreeSnapshot | null> {
  try {
    return await describePaths(repoRoot, await listPaths(repoRoot));
  } catch {
    return null;
  }
}

export async function hasWorkingTreeChanged(
  repoRoot: string,
  before: WorkingTreeSnapshot | null,
): Promise<boolean> {
  if (!before) return false;
  try {
    const nowDirty = await listPaths(repoRoot);
    if (nowDirty.some((path) => !before.has(path))) return true;
    const after = await describePaths(repoRoot, before.keys());
    for (const [path, description] of before) {
      if (after.get(path) !== description) return true;
    }
    return false;
  } catch {
    return false;
  }
}
