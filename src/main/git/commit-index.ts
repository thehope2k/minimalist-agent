import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { GitCommitFile } from '../../shared/electron-api';

const execFileAsync = promisify(execFile);
const GIT_COMMAND_TIMEOUT_MS = 30_000;

export interface TemporaryIndex {
  directory: string;
  path: string;
  env: NodeJS.ProcessEnv;
}

async function getFileMode(absolutePath: string): Promise<string> {
  try {
    const file = await stat(absolutePath);
    return (file.mode & 0o111) !== 0 ? '100755' : '100644';
  } catch {
    return '100644';
  }
}

async function readHead(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'rev-parse', '--verify', 'HEAD'],
      { timeout: GIT_COMMAND_TIMEOUT_MS },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function assertIndexIsResolved(repoRoot: string): Promise<void> {
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'ls-files', '--unmerged'], {
    timeout: GIT_COMMAND_TIMEOUT_MS,
  });
  if (stdout.trim()) throw new Error('Cannot create a partial commit with unresolved conflicts');
}

export async function createTemporaryIndex(repoRoot: string): Promise<TemporaryIndex> {
  const directory = await mkdtemp(join(tmpdir(), 'ma-git-index-'));
  const path = join(directory, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: path };
  const head = await readHead(repoRoot);
  const args = head ? ['read-tree', head] : ['read-tree', '--empty'];

  try {
    await execFileAsync('git', ['-C', repoRoot, ...args], {
      env,
      timeout: GIT_COMMAND_TIMEOUT_MS,
    });
    return { directory, path, env };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function stageContent(
  repoRoot: string,
  file: GitCommitFile,
  temporaryIndex: TemporaryIndex,
): Promise<void> {
  const contentPath = join(temporaryIndex.directory, 'content');
  await writeFile(contentPath, file.content ?? '', 'utf8');
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoRoot, 'hash-object', '-w', contentPath],
    { timeout: GIT_COMMAND_TIMEOUT_MS },
  );
  const mode = await getFileMode(file.absolutePath);
  await execFileAsync(
    'git',
    [
      '-C',
      repoRoot,
      'update-index',
      '--add',
      '--cacheinfo',
      `${mode},${stdout.trim()},${file.relativePath}`,
    ],
    { env: temporaryIndex.env, timeout: GIT_COMMAND_TIMEOUT_MS },
  );
}

export async function assertHasStagedChanges(
  repoRoot: string,
  temporaryIndex: TemporaryIndex,
): Promise<void> {
  try {
    await execFileAsync('git', ['-C', repoRoot, 'diff', '--cached', '--quiet'], {
      env: temporaryIndex.env,
      timeout: GIT_COMMAND_TIMEOUT_MS,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 1) return;
    throw error;
  }
  throw new Error('Nothing to commit');
}

export async function stageCommitFiles(
  repoRoot: string,
  files: GitCommitFile[],
  temporaryIndex: TemporaryIndex,
  signal?: AbortSignal,
): Promise<void> {
  for (const file of files) {
    signal?.throwIfAborted();
    if (file.status === 'D') {
      await execFileAsync(
        'git',
        ['-C', repoRoot, 'update-index', '--force-remove', '--', file.relativePath],
        { env: temporaryIndex.env, timeout: GIT_COMMAND_TIMEOUT_MS },
      );
      continue;
    }

    if (file.content !== undefined) {
      await stageContent(repoRoot, file, temporaryIndex);
      continue;
    }

    await execFileAsync('git', ['-C', repoRoot, 'add', '--force', '--', file.absolutePath], {
      env: temporaryIndex.env,
      timeout: GIT_COMMAND_TIMEOUT_MS,
    });
  }
}

async function listChangedPaths(
  repoRoot: string,
  previousHead: string | null,
  nextHead: string,
): Promise<string[]> {
  const args = previousHead
    ? ['diff', '--name-only', '--no-renames', '-z', previousHead, nextHead]
    : ['ls-tree', '-r', '--name-only', '-z', nextHead];
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, ...args], {
    encoding: 'buffer',
    timeout: GIT_COMMAND_TIMEOUT_MS,
  });
  return stdout.toString('utf8').split('\0').filter(Boolean);
}

function resetIndexPaths(repoRoot: string, head: string, paths: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['-C', repoRoot, 'reset', '--quiet', '--pathspec-from-file=-', '--pathspec-file-nul', head],
      {
        stdio: ['pipe', 'ignore', 'pipe'],
        // Paths come from git verbatim; without this, names like `*.ts` or `:(top)x` are parsed as pathspec magic.
        env: { ...process.env, GIT_LITERAL_PATHSPECS: '1' },
      },
    );
    let errorOutput = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, GIT_COMMAND_TIMEOUT_MS);

    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error('Index reconciliation timed out'));
        return;
      }
      if (code !== 0) {
        reject(new Error(errorOutput.trim() || `Git exited with code ${code}`));
        return;
      }
      resolve();
    });
    child.stdin.end(Buffer.from(`${paths.join('\0')}\0`));
  });
}

export async function reconcileRealIndex(
  repoRoot: string,
  previousHead: string | null,
  nextHead: string,
): Promise<void> {
  const changedPaths = await listChangedPaths(repoRoot, previousHead, nextHead);
  if (changedPaths.length === 0) return;
  await resetIndexPaths(repoRoot, nextHead, changedPaths);
}

export async function removeTemporaryIndex(temporaryIndex: TemporaryIndex | null): Promise<void> {
  if (!temporaryIndex) return;
  await rm(temporaryIndex.directory, { recursive: true, force: true });
}

export { readHead };
