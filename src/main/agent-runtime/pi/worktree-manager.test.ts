import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../../shared/sub-logger';
import {
  cleanupAllWorktrees,
  configureWorktreeLogger,
  createAgentWorktree,
  removeAgentWorktree,
} from './worktree-manager';

const runGit = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

let root = '';

beforeEach(() => {
  configureWorktreeLogger(createLogger('worktree-test'));
  root = mkdtempSync(join(tmpdir(), 'minimalist-agent-worktree-'));
  runGit(root, ['init']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Test User']);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  runGit(root, ['add', 'README.md']);
  runGit(root, ['commit', '-m', 'fixture']);
});

afterEach(async () => {
  await cleanupAllWorktrees();
  rmSync(root, { recursive: true, force: true });
});

describe('worktree manager', () => {
  it('falls back to the original directory outside a Git repository', async () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'minimalist-agent-non-git-'));
    try {
      await expect(createAgentWorktree(nonGit, 'fallback')).resolves.toEqual({
        path: nonGit,
        branch: '',
        created: false,
      });
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it('creates and removes a clean isolated worktree', async () => {
    const result = await createAgentWorktree(root, 'clean', { baseRef: 'head' });
    expect(result.created).toBe(true);
    expect(existsSync(result.path)).toBe(true);

    await removeAgentWorktree('clean');
    expect(existsSync(result.path)).toBe(false);
  });

  it('keeps a worktree with uncommitted changes for review', async () => {
    const result = await createAgentWorktree(root, 'changed', { baseRef: 'head' });
    writeFileSync(join(result.path, 'changed.txt'), 'keep me\n');

    await removeAgentWorktree('changed');
    expect(existsSync(result.path)).toBe(true);
  });
});
