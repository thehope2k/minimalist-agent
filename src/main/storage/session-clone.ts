import { constants } from 'node:fs';
import { cp, lstat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const BYTES_PER_MB = 1024 * 1024;
export const MAX_CLONE_BYTES = 500 * BYTES_PER_MB;

export type CloneOutcome = 'cloned' | 'absent' | 'too-large';

async function exceedsBytes(root: string, limit: number): Promise<boolean> {
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      total += (await lstat(path)).size;
      if (total > limit) return true;
    }
  }
  return false;
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Uses copy-on-write where the filesystem supports it (APFS), so a large
 * scratch dir costs almost no extra disk until a file is modified.
 */
export async function cloneDirectory(
  source: string,
  destination: string,
  maxBytes: number = MAX_CLONE_BYTES,
): Promise<CloneOutcome> {
  if (!(await exists(source))) return 'absent';
  if (await exceedsBytes(source, maxBytes)) return 'too-large';
  const destinationExisted = await exists(destination);
  try {
    await cp(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
  } catch (error) {
    if (!destinationExisted) await rm(destination, { recursive: true, force: true });
    throw error;
  }
  return 'cloned';
}
