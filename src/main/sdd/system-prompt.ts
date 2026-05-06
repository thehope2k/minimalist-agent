import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSddSkillBlock } from './bundled-skill';
import { SPECKIT_VERSION } from './version';
import { getState } from './session-state';
import { deriveEntityPhase } from './phase';

/**
 * Build the SDD context block appended to the system prompt each turn.
 * Returns '' when SDD mode is Off, no entities found, or sessionId missing.
 *
 * Uses the detected CLI version (from scan) rather than the hardcoded
 * SPECKIT_VERSION so the coaching text stays accurate after CLI upgrades.
 *
 * Skips the static skill directive when the Pi integration skill file is
 * already present in the entity (.pi/skills/speckit.md created by
 * `specify integration add pi`) to avoid injecting duplicate instructions.
 */
export function buildSddPromptBlock(sessionId: string | undefined): string {
  if (!sessionId) return '';

  const state = getState(sessionId);
  if (!state || state.mode === 'off' || state.entities.length === 0) return '';

  // Use the version detected at scan time; fall back to the bundled constant.
  const version = state.cliVersion ?? SPECKIT_VERSION;

  // Find active entity for this cwd
  const activeRoot = state.activeEntityRootPath;
  const activeEntity = state.entities.find((e) => e.rootPath === activeRoot);

  let phaseContext = '';
  if (activeEntity) {
    const phase = deriveEntityPhase(activeEntity.features, activeEntity.hasConstitution);
    const MAX_FEATURES = 5;
    const shownFeatures = activeEntity.features.slice(0, MAX_FEATURES);
    const hiddenCount = activeEntity.features.length - shownFeatures.length;
    const artifactLines = shownFeatures.map((f) => {
      const parts: string[] = [];
      if (f.artifacts.hasSpec) parts.push('spec.md');
      if (f.artifacts.hasPlan) parts.push('plan.md');
      if (f.artifacts.hasTasks) {
        const { taskCount, taskCompletionRatio } = f.artifacts;
        const progress = taskCount > 0
          ? ` (${Math.round(taskCompletionRatio * taskCount)}/${taskCount} tasks done)`
          : ' (0 tasks)';
        parts.push(`tasks.md${progress}`);
      }
      if (f.artifacts.extraArtifacts.length > 0) {
        parts.push(...f.artifacts.extraArtifacts);
      }
      return `  - ${f.name}: ${parts.length ? parts.join(', ') : 'no artifacts yet'}`;
    });
    if (hiddenCount > 0) {
      artifactLines.push(`  ... and ${hiddenCount} more feature${hiddenCount > 1 ? 's' : ''} (run \`ls .specify/specs/\` to see all)`);
    }
    const artifactList = artifactLines.join('\n');

    phaseContext = `
<sdd_context>
Active SDD entity: ${activeEntity.name} (${activeEntity.specifyPath})
Current phase: ${phase}
Constitution: ${activeEntity.hasConstitution ? 'exists' : 'missing'}
Features (${activeEntity.features.length} total):
${artifactList || '  (none yet)'}
</sdd_context>`;
  } else if (state.entities.length === 1) {
    // Single-entity shortcut: use the only entity
    const entity = state.entities[0];
    const phase = deriveEntityPhase(entity.features, entity.hasConstitution);
    phaseContext = `
<sdd_context>
Active SDD entity: ${entity.name} (${entity.specifyPath})
Current phase: ${phase}
Constitution: ${entity.hasConstitution ? 'exists' : 'missing'}
Features: ${entity.features.length}
</sdd_context>`;
  }

  // Skip the static skill block when the Pi integration already installed its
  // own skill file — injecting both would send duplicate/conflicting rules.
  const entityForSkillCheck = activeEntity ?? (state.entities.length === 1 ? state.entities[0] : null);
  const skillAlreadyInstalled =
    entityForSkillCheck != null &&
    existsSync(join(entityForSkillCheck.rootPath, '.pi', 'skills', 'speckit.md'));

  const skillBlock = skillAlreadyInstalled ? '' : buildSddSkillBlock(version);

  return `${skillBlock}${phaseContext}`;
}
