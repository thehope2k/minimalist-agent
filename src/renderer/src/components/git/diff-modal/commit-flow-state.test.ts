import { describe, expect, it } from 'vitest';
import { reconcileStagingAfterAttempt, shouldClearCommitDraft } from './commit-flow-state';
import type { GitRepo } from '../types';

function repository(root: string, paths: string[]): GitRepo {
  return {
    root,
    files: paths.map((absolutePath) => ({
      absolutePath,
      relativePath: absolutePath.split('/').pop() ?? absolutePath,
      status: 'M',
      repoRoot: root,
    })),
  };
}

describe('shouldClearCommitDraft', () => {
  it('clears after complete success', () => {
    expect(
      shouldClearCommitDraft({
        ok: true,
        outcomes: [{ ok: true }],
        notAttemptedRepoRoots: [],
      }),
    ).toBe(true);
  });

  it('clears after a created commit even when index reconciliation fails', () => {
    expect(
      shouldClearCommitDraft({
        ok: false,
        outcomes: [{ ok: false, commitCreated: true }],
        notAttemptedRepoRoots: [],
      }),
    ).toBe(true);
  });

  it('retains the message when another repository was not attempted', () => {
    expect(
      shouldClearCommitDraft({
        ok: false,
        outcomes: [{ ok: false, commitCreated: true }],
        notAttemptedRepoRoots: ['/next'],
      }),
    ).toBe(false);
  });
});

describe('reconcileStagingAfterAttempt', () => {
  it('retains selections in a failed repository after refresh', () => {
    const before = [repository('/repo', ['/repo/a.ts'])];
    const result = reconcileStagingAfterAttempt({
      stagedPaths: new Set(['/repo/a.ts']),
      stagedHunks: new Map([['/repo/a.ts', new Set([0])]]),
      repositoriesBefore: before,
      repositoriesAfter: before,
      successfulRepoRoots: new Set(),
    });

    expect([...result.stagedPaths]).toEqual(['/repo/a.ts']);
    expect([...result.stagedHunks.get('/repo/a.ts')!]).toEqual([0]);
  });

  it('clears successful repository selections and stale paths only', () => {
    const before = [
      repository('/first', ['/first/a.ts']),
      repository('/second', ['/second/b.ts', '/second/removed.ts']),
    ];
    const after = [repository('/second', ['/second/b.ts'])];
    const result = reconcileStagingAfterAttempt({
      stagedPaths: new Set(['/first/a.ts', '/second/b.ts', '/second/removed.ts']),
      stagedHunks: new Map(),
      repositoriesBefore: before,
      repositoriesAfter: after,
      successfulRepoRoots: new Set(['/first']),
    });

    expect([...result.stagedPaths]).toEqual(['/second/b.ts']);
  });
});
