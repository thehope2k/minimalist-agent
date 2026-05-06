import type { SddFeature, SddPhase } from './sdd-types';
import { SDD_PHASE_ORDER } from './sdd-types';

/**
 * Derive the representative phase for a whole entity from its feature list.
 * Returns the lowest (earliest) phase across all features, so the badge
 * shows what still needs to be done. Falls back to 'specify' when no features.
 *
 * Shared between main (system-prompt.ts) and renderer (lib/sdd.ts).
 */
export function deriveEntityPhase(
  features: SddFeature[],
  hasConstitution: boolean,
): SddPhase {
  if (!hasConstitution) return 'constitution';
  if (features.length === 0) return 'specify';

  let lowestIndex = SDD_PHASE_ORDER.length - 1;
  for (const f of features) {
    const idx = SDD_PHASE_ORDER.indexOf(f.currentPhase);
    if (idx < lowestIndex) lowestIndex = idx;
  }
  return SDD_PHASE_ORDER[lowestIndex];
}
