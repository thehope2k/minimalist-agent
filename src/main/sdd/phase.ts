import type { SddArtifactSet, SddPhase } from './types';

// Re-export from shared so all consumers can import from one place.
export { deriveEntityPhase } from '../../shared/sdd-phase';

/**
 * Derive the canonical SDD phase from a single feature's artifact set.
 * Phase is the next action needed — not the last completed one.
 *
 * tasks.md existing but containing zero checkboxes means the file was
 * generated from a template but not yet populated — treat as still in
 * 'tasks' phase, not 'implement'.
 */
export function deriveSddPhase(
  artifacts: SddArtifactSet,
  hasConstitution: boolean,
): SddPhase {
  if (!hasConstitution) return 'constitution';
  if (!artifacts.hasSpec) return 'specify';
  if (!artifacts.hasPlan) return 'plan';
  if (!artifacts.hasTasks) return 'tasks';
  if (artifacts.taskCount === 0) return 'tasks';        // empty tasks.md template
  if (artifacts.taskCompletionRatio < 1) return 'implement';
  return 'complete';
}
