import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '../../../shared/log';

export const execFileAsync = promisify(execFile);

export async function isGitRepository(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function getGitRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
    return stdout.trim();
  } catch {
    return cwd;
  }
}

export async function getBaseRef(
  cwd: string,
  baseRef: 'fresh' | 'head',
  log: Logger,
): Promise<string> {
  if (baseRef === 'head') return 'HEAD';
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd,
    });
    return stdout.trim().replace('refs/remotes/', '');
  } catch {
    log.warn('No origin/HEAD found, falling back to local HEAD');
    return 'HEAD';
  }
}
