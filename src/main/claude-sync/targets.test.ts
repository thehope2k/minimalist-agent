import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../storage/projects', () => ({ listProjects: () => [] }));
vi.mock('../storage/settings', () => ({
  getSettings: () => ({}),
  saveSettings: () => {},
  DEFAULT_CONTEXT_FILE_NAMES: [],
}));

import { scanForProjects } from './targets';

const roots: string[] = [];
afterEach(() => {
  for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true });
});

function withSkill(dir: string): void {
  mkdirSync(join(dir, '.minimalist-agent', 'skills', 's'), { recursive: true });
  writeFileSync(join(dir, '.minimalist-agent', 'skills', 's', 'SKILL.md'), 'x');
}

describe('scanForProjects', () => {
  it('finds projects up to three levels down and skips build/vendor folders', () => {
    const base = mkdtempSync(join(tmpdir(), 'ma-scan-'));
    roots.push(base);
    withSkill(join(base, 'a'));
    withSkill(join(base, 'group', 'team', 'b'));
    withSkill(join(base, 'too', 'deep', 'down', 'c'));
    withSkill(join(base, 'node_modules', 'pkg'));
    mkdirSync(join(base, 'empty', '.minimalist-agent', 'skills'), { recursive: true });

    expect(
      scanForProjects(base)
        .map((p) => p.slice(base.length + 1))
        .sort(),
    ).toEqual(['a', join('group', 'team', 'b')]);
  });
});
