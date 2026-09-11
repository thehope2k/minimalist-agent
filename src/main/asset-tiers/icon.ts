// Shared `icon.{ext}` discovery for asset directories (skills, extensions, agents).

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

/** Find the first `icon.{ext}` file directly inside `dir`, if any. */
export function findIconFile(dir: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const candidate = join(dir, `icon${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}
