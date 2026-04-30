// Materialize the bundled extensions reference doc to disk on boot.
// Mirrors `skills/install-reference.ts`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Paths } from '../storage/paths';
import {
  EXTENSIONS_REFERENCE_MD,
  EXTENSIONS_REFERENCE_VERSION,
} from './reference-doc';

const VERSION_MARKER = (v: string) =>
  `<!-- extensions-reference-version: ${v} -->`;

export function installExtensionsReferenceDoc(): void {
  const dest = Paths.extensionsReferenceDoc();
  const expectedMarker = VERSION_MARKER(EXTENSIONS_REFERENCE_VERSION);

  if (existsSync(dest)) {
    try {
      const onDisk = readFileSync(dest, 'utf-8');
      if (onDisk.startsWith(expectedMarker)) return;
    } catch {
      /* fall through to rewrite */
    }
  }

  Paths.docsDir();
  const content = `${expectedMarker}\n\n${EXTENSIONS_REFERENCE_MD}`;
  writeFileSync(dest, content, 'utf-8');
}
