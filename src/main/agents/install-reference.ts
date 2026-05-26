// Materialize the bundled agents reference doc to disk on app boot.
// We write `<userData>/docs/agents.md` if missing, OR if the bundled
// version is newer than what's on disk (tracked via a leading HTML
// comment marker).
//
// The doc is a constant string in `reference-doc.ts`, so version updates
// just require bumping `AGENTS_REFERENCE_VERSION`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Paths } from '../storage/paths';
import {
  AGENTS_REFERENCE_MD,
  AGENTS_REFERENCE_VERSION,
} from './reference-doc';

const VERSION_MARKER = (v: string) => `<!-- agents-reference-version: ${v} -->`;

/**
 * Idempotently install / refresh the agents reference doc.
 * Safe to call repeatedly — only writes when the version changes.
 */
export function installAgentsReferenceDoc(): void {
  const dest = Paths.agentsReferenceDoc();
  const expectedMarker = VERSION_MARKER(AGENTS_REFERENCE_VERSION);

  if (existsSync(dest)) {
    try {
      const onDisk = readFileSync(dest, 'utf-8');
      if (onDisk.startsWith(expectedMarker)) return; // already up to date
    } catch {
      /* fall through to rewrite */
    }
  }

  // The docs directory is auto-created by Paths.docsDir(); calling
  // agentsReferenceDoc() goes through root() but doesn't mkdir, so make
  // sure the directory exists.
  Paths.docsDir();

  const content = `${expectedMarker}\n\n${AGENTS_REFERENCE_MD}`;
  writeFileSync(dest, content, 'utf-8');
}
