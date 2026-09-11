// Shared recursive directory scanner backing each asset type's info-page
// file tree view (SkillInfoPage, ExtensionInfoPage, AgentInfoPage).

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type AssetFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: AssetFileNode[] };

/** Recursively scan a directory, dotfiles excluded, dirs-then-files alphabetical. */
export function scanAssetDirectory(dir: string): AssetFileNode[] {
  if (!existsSync(dir)) return [];
  const out: AssetFileNode[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      out.push({
        kind: 'dir',
        name,
        path: full,
        children: scanAssetDirectory(full),
      });
    } else if (info.isFile()) {
      out.push({ kind: 'file', name, path: full, size: info.size });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
