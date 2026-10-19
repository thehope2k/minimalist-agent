import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateGitExclude } from './claude-state';

const dirs: string[] = [];
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ma-sync-'));
  dirs.push(root);
  mkdirSync(join(root, '.git', 'info'), { recursive: true });
  return root;
}
const exclude = (gitDir: string) => readFileSync(join(gitDir, 'info', 'exclude'), 'utf8');

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('updateGitExclude', () => {
  it("adds MA's block after the user's own lines and rewrites it in place", () => {
    const root = repo();
    writeFileSync(join(root, '.git', 'info', 'exclude'), '*.log');
    updateGitExclude(root, ['.claude/skills/b/', '.claude/skills/a/']);
    updateGitExclude(root, ['.claude/skills/a/']);
    const text = exclude(join(root, '.git'));
    expect(text.startsWith('*.log\n')).toBe(true);
    expect(text.split('>>> minimalist-agent sync').length - 1).toBe(1);
    expect(text).toContain('.claude/skills/a/');
    expect(text).not.toContain('.claude/skills/b/');
  });

  it('removes the block when nothing is synced any more', () => {
    const root = repo();
    writeFileSync(join(root, '.git', 'info', 'exclude'), 'dist\n');
    updateGitExclude(root, ['.claude/x.md']);
    updateGitExclude(root, []);
    expect(exclude(join(root, '.git'))).toBe('dist\n');
  });

  it('follows a .git file to the real git dir (worktrees)', () => {
    const real = repo();
    const worktree = mkdtempSync(join(tmpdir(), 'ma-wt-'));
    dirs.push(worktree);
    writeFileSync(join(worktree, '.git'), `gitdir: ${join(real, '.git')}\n`);
    updateGitExclude(worktree, ['.claude/agents/a.md']);
    expect(exclude(join(real, '.git'))).toContain('.claude/agents/a.md');
  });

  it('does nothing outside a git repo', () => {
    const plain = mkdtempSync(join(tmpdir(), 'ma-plain-'));
    dirs.push(plain);
    expect(() => updateGitExclude(plain, ['.claude/x.md'])).not.toThrow();
  });
});
