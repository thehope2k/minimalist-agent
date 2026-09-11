// Materialize the bundled extensions reference doc to disk on boot.
// Mirrors `skills/install-reference.ts` via the shared `asset-tiers` helper.

import { Paths } from '../storage/paths';
import { installReferenceDoc } from '../asset-tiers/install-reference';
import {
  EXTENSIONS_REFERENCE_MD,
  EXTENSIONS_REFERENCE_VERSION,
} from './reference-doc';

export function installExtensionsReferenceDoc(): void {
  installReferenceDoc({
    destPath: Paths.extensionsReferenceDoc(),
    markerName: 'extensions-reference',
    version: EXTENSIONS_REFERENCE_VERSION,
    markdown: EXTENSIONS_REFERENCE_MD,
  });
}
