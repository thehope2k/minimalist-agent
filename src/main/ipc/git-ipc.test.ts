import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../files/path-guard', () => ({
  isWithinAllowedRoots: (p: string) => p.startsWith('/work'),
  resolveWithinAllowedRoots: (p: string) => (p.startsWith('/work') ? p : null),
}));

import { findCommitRequestViolation } from './git-ipc';

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    repoRoot: '/work/repo',
    message: 'm',
    operationId: 'op',
    files: [{ relativePath: 'a.ts', absolutePath: '/work/repo/a.ts', status: 'M' }],
    ...overrides,
  }) as Parameters<typeof findCommitRequestViolation>[0];

describe('findCommitRequestViolation', () => {
  it('accepts requests inside allowed roots', () => {
    expect(findCommitRequestViolation(request())).toBeNull();
  });

  it('rejects a repository outside allowed roots', () => {
    expect(findCommitRequestViolation(request({ repoRoot: '/etc' }))).toMatch(/outside/);
  });

  it('rejects escaping relative paths', () => {
    const files = [{ relativePath: '../x', absolutePath: '/work/repo/x', status: 'M' }];
    expect(findCommitRequestViolation(request({ files }))).toMatch(/Unsafe path/);
  });

  it('rejects files outside allowed roots but not deleted ones', () => {
    const outside = [{ relativePath: 'a', absolutePath: '/etc/a', status: 'M' }];
    expect(findCommitRequestViolation(request({ files: outside }))).toMatch(/outside/);
    const deleted = [{ relativePath: 'a', absolutePath: '/etc/a', status: 'D' }];
    expect(findCommitRequestViolation(request({ files: deleted }))).toBeNull();
  });
});
