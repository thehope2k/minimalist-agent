import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cp } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneDirectory } from './session-clone';

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>();
  return { ...actual, cp: vi.fn(actual.cp) };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'clone-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('cloneDirectory', () => {
  it('copies nested files', async () => {
    const source = join(root, 'src');
    mkdirSync(join(source, 'deep'), { recursive: true });
    writeFileSync(join(source, 'deep', 'a.txt'), 'hello');

    const outcome = await cloneDirectory(source, join(root, 'dst'));

    expect(outcome).toBe('cloned');
    expect(readFileSync(join(root, 'dst', 'deep', 'a.txt'), 'utf-8')).toBe('hello');
  });

  it('reports a missing source without creating the destination', async () => {
    const outcome = await cloneDirectory(join(root, 'missing'), join(root, 'dst'));

    expect(outcome).toBe('absent');
    expect(existsSync(join(root, 'dst'))).toBe(false);
  });

  it('skips directories above the size limit', async () => {
    const source = join(root, 'src');
    mkdirSync(source);
    writeFileSync(join(source, 'big.bin'), Buffer.alloc(100));

    const outcome = await cloneDirectory(source, join(root, 'dst'), 99);

    expect(outcome).toBe('too-large');
    expect(existsSync(join(root, 'dst'))).toBe(false);
  });

  it('removes a half-copied destination when the copy fails', async () => {
    const source = join(root, 'src');
    mkdirSync(source);
    writeFileSync(join(source, 'a.txt'), 'x');
    vi.mocked(cp).mockImplementationOnce(async (_from, to) => {
      mkdirSync(String(to));
      throw new Error('disk full');
    });

    await expect(cloneDirectory(source, join(root, 'dst'))).rejects.toThrow('disk full');

    expect(existsSync(join(root, 'dst'))).toBe(false);
  });
});
