// Shared "materialize a bundled reference doc to <userData>/docs/*.md on
// boot" logic for skills.md / extensions.md. Idempotent — only rewrites when
// the version marker on disk is stale.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Paths } from '../storage/paths';

export function installReferenceDoc(opts: {
  destPath: string;
  markerName: string;
  version: string;
  markdown: string;
}): void {
  const { destPath, markerName, version, markdown } = opts;
  const marker = `<!-- ${markerName}-version: ${version} -->`;

  if (existsSync(destPath)) {
    try {
      const onDisk = readFileSync(destPath, 'utf-8');
      if (onDisk.startsWith(marker)) return; // already up to date
    } catch {
      /* fall through to rewrite */
    }
  }

  // docsDir() auto-creates the directory; the per-doc path getters go
  // through root() but don't mkdir, so make sure it exists first.
  Paths.docsDir();

  writeFileSync(destPath, `${marker}\n\n${markdown}`, 'utf-8');
}
