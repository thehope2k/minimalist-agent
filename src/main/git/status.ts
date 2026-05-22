// Git status discovery for the Cmd+G diff review modal.
// Two responsibilities:
//   1. Discover all git roots reachable from a cwd (handles multi-repo workspaces).
//   2. Run `git status --porcelain` per root and return structured file entries.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

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

export interface GitStatusResult {
  repos: GitRepo[];
  /** Set when the whole call failed, e.g. git not installed. */
  error?: string;
}

async function findGitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', dir, 'rev-parse', '--show-toplevel'],
      { timeout: 5_000 },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Collect git roots reachable from `cwd`:
 *   - The repo that contains cwd itself (walk up until a .git is found).
 *   - Any immediate sub-directories of cwd that are separate git repos.
 *
 * One level of sub-directory scan is enough to cover the common "parent
 * folder with multiple repos" pattern without being slow.
 */
async function discoverGitRoots(cwd: string): Promise<string[]> {
  const roots = new Set<string>();

  const cwdRoot = await findGitRoot(cwd);
  if (cwdRoot) roots.add(cwdRoot);

  try {
    const entries = readdirSync(cwd);
    await Promise.all(
      entries.map(async (name) => {
        if (name.startsWith('.')) return;
        const subdir = join(cwd, name);
        try {
          if (!statSync(subdir).isDirectory()) return;
        } catch {
          return;
        }
        const subRoot = await findGitRoot(subdir);
        if (subRoot) roots.add(subRoot);
      }),
    );
  } catch {
    // cwd not readable — ignore, we already have the root from walk-up above.
  }

  return [...roots];
}

function parseStatusCode(xy: string): GitFileStatus {
  const x = xy[0] ?? ' ';
  const y = xy[1] ?? ' ';
  if (x === '?' && y === '?') return '?';
  if (x === 'R' || y === 'R') return 'R';
  if (x === 'D' || y === 'D') return 'D';
  if (x === 'A' || y === 'A') return 'A';
  return 'M';
}

async function getRepoStatus(root: string): Promise<GitFileEntry[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', root, 'status', '--porcelain', '-u'],
    { timeout: 10_000 },
  );

  const files: GitFileEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const xy = line.slice(0, 2);
    let filePart = line.slice(3);

    // Rename lines look like: "R  old-name -> new-name" — we want the new name.
    const arrowIdx = filePart.indexOf(' -> ');
    if (arrowIdx !== -1) filePart = filePart.slice(arrowIdx + 4);

    const relativePath = filePart.trim();
    if (!relativePath) continue;

    files.push({
      absolutePath: join(root, relativePath),
      relativePath,
      status: parseStatusCode(xy),
      repoRoot: root,
    });
  }

  return files;
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  try {
    const roots = await discoverGitRoots(cwd);
    if (roots.length === 0) return { repos: [], error: 'no_git_repos' };

    const repos = await Promise.all(
      roots.map(async (root) => {
        try {
          return { root, files: await getRepoStatus(root) };
        } catch {
          return { root, files: [] };
        }
      }),
    );

    // Only include repos that actually have changes.
    return { repos: repos.filter((r) => r.files.length > 0) };
  } catch (e) {
    return {
      repos: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
