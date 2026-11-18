import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPdfFile } from './pdf-document';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pdf-document-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isPdfFile', () => {
  it.skipIf(process.platform === 'win32')(
    'returns false for a named pipe without blocking',
    async () => {
      const fifo = join(dir, 'pipe.pdf');
      execFileSync('mkfifo', [fifo]);
      await expect(isPdfFile(fifo)).resolves.toBe(false);
    },
  );

  it('returns false for a directory', async () => {
    await expect(isPdfFile(dir)).resolves.toBe(false);
  });
});
