// Materialize the bundled skills reference doc to disk on app boot.
// We write `<userData>/docs/skills.md` if missing, OR if the bundled
// version is newer than what's on disk (tracked via a leading HTML
// comment marker).
//
// The doc is a constant string in `reference-doc.ts`, so version updates
// just require bumping `SKILLS_REFERENCE_VERSION`.

import { Paths } from '../storage/paths';
import { installReferenceDoc } from '../asset-tiers/install-reference';
import { SKILLS_REFERENCE_MD, SKILLS_REFERENCE_VERSION } from './reference-doc';

/**
 * Idempotently install / refresh the skills reference doc.
 * Safe to call repeatedly — only writes when the version changes.
 */
export function installSkillsReferenceDoc(): void {
  installReferenceDoc({
    destPath: Paths.skillsReferenceDoc(),
    markerName: 'skills-reference',
    version: SKILLS_REFERENCE_VERSION,
    markdown: SKILLS_REFERENCE_MD,
  });
}
