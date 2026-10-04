import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { commitFiles, preflightCommit } from './commit';

const repositories: string[] = [];

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function createRepository(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ma-commit-'));
  repositories.push(repoRoot);
  git(repoRoot, ['init', '--quiet']);
  git(repoRoot, ['config', 'user.name', 'Test User']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);
  writeFileSync(join(repoRoot, 'selected.txt'), 'selected original\n');
  writeFileSync(join(repoRoot, 'external.txt'), 'external original\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '--quiet', '-m', 'initial']);
  return repoRoot;
}

function installHook(repoRoot: string, body: string): void {
  const hooksDir = join(repoRoot, '.git', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, 'pre-commit');
  writeFileSync(hookPath, `#!/bin/sh\n${body}\n`);
  chmodSync(hookPath, 0o755);
}

afterEach(() => {
  for (const repoRoot of repositories.splice(0)) {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

describe('commitFiles', () => {
  it('preserves unrelated staged changes after a selected-file commit', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected committed\n');
    writeFileSync(join(repoRoot, 'external.txt'), 'external staged\n');
    git(repoRoot, ['add', 'external.txt']);

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'selected change',
    });

    expect(result.ok).toBe(true);
    expect(git(repoRoot, ['show', 'HEAD:selected.txt'])).toBe('selected committed');
    expect(git(repoRoot, ['diff', '--cached', '--name-only'])).toBe('external.txt');
  });

  it('does not block commits when the working-tree diff exceeds the output buffer', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected committed\n');
    writeFileSync(join(repoRoot, 'external.txt'), 'x'.repeat(11 * 1024 * 1024));

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'selected change with large external diff',
    });

    expect(result.ok).toBe(true);
    expect(git(repoRoot, ['show', 'HEAD:selected.txt'])).toBe('selected committed');
  });

  it('restores the original index when a hook rejects the commit', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected changed\n');
    writeFileSync(join(repoRoot, 'external.txt'), 'external staged\n');
    git(repoRoot, ['add', 'external.txt']);
    installHook(repoRoot, 'echo "lint rejected commit" >&2\nexit 1');

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'rejected change',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.diagnostics.stderr).toContain('lint rejected commit');
    expect(git(repoRoot, ['diff', '--cached', '--name-only'])).toBe('external.txt');
    expect(git(repoRoot, ['log', '-1', '--format=%s'])).toBe('initial');
  });

  it('reports working-tree changes made by a rejecting formatter hook', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'unformatted\n');
    installHook(
      repoRoot,
      'printf "formatted\\n" > selected.txt\necho "files were formatted" >&2\nexit 1',
    );

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'format change',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? false : result.workingTreeChanged).toBe(true);
    expect(readFileSync(selectedPath, 'utf8')).toBe('formatted\n');
  });

  it('detects hook edits to existing untracked files', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected changed\n');
    writeFileSync(join(repoRoot, 'notes.tmp'), 'before\n');
    installHook(repoRoot, 'printf "after\\n" > notes.tmp\nexit 1');

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'untracked hook edit',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? false : result.workingTreeChanged).toBe(true);
  });

  it('commits synthesized partial content without replacing the working file', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected full working copy\n');

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
          content: 'selected partial commit\n',
        },
      ],
      message: 'partial change',
    });

    expect(result.ok).toBe(true);
    expect(git(repoRoot, ['show', 'HEAD:selected.txt'])).toBe('selected partial commit');
    expect(readFileSync(selectedPath, 'utf8')).toBe('selected full working copy\n');
  });

  it('commits new and deleted files through the temporary index', async () => {
    const repoRoot = createRepository();
    const addedPath = join(repoRoot, 'added.txt');
    writeFileSync(addedPath, 'added\n');
    rmSync(join(repoRoot, 'selected.txt'));

    const result = await commitFiles({
      repoRoot,
      files: [
        { relativePath: 'added.txt', absolutePath: addedPath, status: '?' },
        {
          relativePath: 'selected.txt',
          absolutePath: join(repoRoot, 'selected.txt'),
          status: 'D',
        },
      ],
      message: 'add and delete',
    });

    expect(result.ok).toBe(true);
    expect(git(repoRoot, ['show', '--format=', '--name-status', 'HEAD'])).toContain('A\tadded.txt');
    expect(git(repoRoot, ['show', '--format=', '--name-status', 'HEAD'])).toContain(
      'D\tselected.txt',
    );
  });

  it('preserves executable mode for synthesized content', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    chmodSync(selectedPath, 0o755);
    writeFileSync(selectedPath, 'working copy\n');

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
          content: 'committed copy\n',
        },
      ],
      message: 'executable content',
    });

    expect(result.ok).toBe(true);
    expect(git(repoRoot, ['ls-tree', 'HEAD', 'selected.txt'])).toMatch(/^100755 /);
  });

  it('supports repositories opened through a linked worktree', async () => {
    const parentRoot = createRepository();
    const worktreeRoot = mkdtempSync(join(tmpdir(), 'ma-worktree-'));
    rmSync(worktreeRoot, { recursive: true, force: true });
    git(parentRoot, ['worktree', 'add', '--quiet', '-b', 'linked-test', worktreeRoot]);
    repositories.push(worktreeRoot);
    const selectedPath = join(worktreeRoot, 'selected.txt');
    writeFileSync(selectedPath, 'linked worktree\n');

    const result = await commitFiles({
      repoRoot: worktreeRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'linked worktree change',
    });

    expect(result.ok).toBe(true);
    expect(git(worktreeRoot, ['show', 'HEAD:selected.txt'])).toBe('linked worktree');
  });

  it('preflights Git identity before any commit starts', async () => {
    const repoRoot = createRepository();
    git(repoRoot, ['config', 'user.name', '']);

    const result = await preflightCommit(repoRoot);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.kind).toBe('git-config');
  });

  it('bypasses a rejecting hook only when explicitly requested', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected changed\n');
    installHook(repoRoot, 'exit 1');

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: selectedPath,
          status: 'M',
        },
      ],
      message: 'bypassed hook',
      skipHooks: true,
    });

    expect(result.ok).toBe(true);
  });

  it('does not report working-tree changes after an untouched successful commit', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    const addedPath = join(repoRoot, 'added.txt');
    writeFileSync(selectedPath, 'selected changed\n');
    writeFileSync(addedPath, 'added\n');

    const result = await commitFiles({
      repoRoot,
      files: [
        { relativePath: 'selected.txt', absolutePath: selectedPath, status: 'M' },
        { relativePath: 'added.txt', absolutePath: addedPath, status: '?' },
      ],
      message: 'untouched tree',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.workingTreeChanged).toBe(false);
  });

  it('does not misclassify hook output that mentions identity or empty commits', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected changed\n');
    installHook(repoRoot, 'echo "set user.name; nothing to commit" >&2\nexit 1');

    const result = await commitFiles({
      repoRoot,
      files: [{ relativePath: 'selected.txt', absolutePath: selectedPath, status: 'M' }],
      message: 'hook text',
    });

    expect(result.ok ? '' : result.kind).toBe('rejected');
  });

  it('reports nothing to commit before running hooks', async () => {
    const repoRoot = createRepository();
    const markerPath = join(repoRoot, 'hook-ran');
    installHook(repoRoot, `touch "${markerPath}"`);

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: join(repoRoot, 'selected.txt'),
          status: 'M',
        },
      ],
      message: 'empty',
    });

    expect(result.ok ? '' : result.kind).toBe('nothing-to-commit');
    expect(existsSync(markerPath)).toBe(false);
  });

  it('stops hook processes when a commit is cancelled', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    const markerPath = join(repoRoot, 'hook-finished');
    writeFileSync(selectedPath, 'selected changed\n');
    installHook(repoRoot, `sleep 2\ntouch "${markerPath}"`);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 500);

    const result = await commitFiles(
      {
        repoRoot,
        files: [{ relativePath: 'selected.txt', absolutePath: selectedPath, status: 'M' }],
        message: 'cancel hook',
      },
      controller.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(result.ok ? '' : result.kind).toBe('cancelled');
    expect(existsSync(markerPath)).toBe(false);
  }, 15_000);

  it('returns a distinct cancellation result', async () => {
    const repoRoot = createRepository();
    const selectedPath = join(repoRoot, 'selected.txt');
    writeFileSync(selectedPath, 'selected changed\n');
    const controller = new AbortController();
    controller.abort();

    const result = await commitFiles(
      {
        repoRoot,
        files: [
          {
            relativePath: 'selected.txt',
            absolutePath: selectedPath,
            status: 'M',
          },
        ],
        message: 'cancelled change',
      },
      controller.signal,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.kind).toBe('cancelled');
    expect(git(repoRoot, ['log', '-1', '--format=%s'])).toBe('initial');
  });

  it('refuses a partial commit while the real index has unresolved conflicts', async () => {
    const repoRoot = createRepository();
    const baseBranch = git(repoRoot, ['branch', '--show-current']);
    git(repoRoot, ['checkout', '-q', '-b', 'other']);
    writeFileSync(join(repoRoot, 'selected.txt'), 'other\n');
    git(repoRoot, ['commit', '-qam', 'other']);
    git(repoRoot, ['checkout', '-q', baseBranch]);
    writeFileSync(join(repoRoot, 'selected.txt'), 'master\n');
    git(repoRoot, ['commit', '-qam', 'master']);
    expect(() => git(repoRoot, ['merge', 'other'])).toThrow();

    const result = await commitFiles({
      repoRoot,
      files: [
        {
          relativePath: 'selected.txt',
          absolutePath: join(repoRoot, 'selected.txt'),
          status: 'U',
        },
      ],
      message: 'must not commit',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.kind).toBe('unmerged-index');
  });
});
