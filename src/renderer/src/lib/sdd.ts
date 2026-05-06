import type { SddArtifactSet, SddPhase } from '../../../shared/sdd-types';

// Re-export shared SDD types needed by the renderer.
export type {
  SddArtifactSet,
  SddEntity,
  SddEntityRole,
  SddFeature,
  SddMapping,
  SddMappingPatch,
  SddPhase,
  SddSessionState,
  SddScanResult,
} from '../../../shared/sdd-types';
export { SDD_PHASE_ORDER } from '../../../shared/sdd-types';

export { deriveEntityPhase } from '../../../shared/sdd-phase';

// ── Phase display helpers ────────────────────────────────────────────────────

const PHASE_LABELS: Record<SddPhase, string> = {
  constitution: 'Constitution',
  specify: 'Specify',
  plan: 'Plan',
  tasks: 'Tasks',
  implement: 'Implement',
  complete: 'Complete',
};

const PHASE_NEXT: Record<SddPhase, string> = {
  constitution: 'Write constitution',
  specify: 'Specify the feature',
  plan: 'Plan the implementation',
  tasks: 'Generate tasks',
  implement: 'Implement tasks',
  complete: 'All done',
};

export function phaseLabel(phase: SddPhase): string {
  return PHASE_LABELS[phase];
}

export function phaseNext(phase: SddPhase): string {
  return PHASE_NEXT[phase];
}

// ── Task progress ────────────────────────────────────────────────────────────

/**
 * Return the { checked, total } counts for tasks.md, or null when the file
 * is absent or has no checkboxes. Prefer this over computing from the ratio
 * directly to get whole numbers without floating-point rounding errors.
 */
export function taskProgress(
  artifacts: SddArtifactSet,
): { checked: number; total: number } | null {
  if (!artifacts.hasTasks || artifacts.taskCount <= 0) return null;
  return {
    total: artifacts.taskCount,
    checked: Math.round(artifacts.taskCompletionRatio * artifacts.taskCount),
  };
}

// ── Artifact badge helpers ───────────────────────────────────────────────────

export interface ArtifactBadge {
  label: 'spec' | 'plan' | 'tasks' | 'impl';
  done: boolean;
  tooltip: string;
}

export function artifactBadges(artifacts: SddArtifactSet): ArtifactBadge[] {
  const progress = taskProgress(artifacts);
  const progressStr = progress ? `${progress.checked}/${progress.total} tasks` : '';

  return [
    {
      label: 'spec',
      done: artifacts.hasSpec,
      tooltip: artifacts.hasSpec ? 'spec.md exists' : 'spec.md missing',
    },
    {
      label: 'plan',
      done: artifacts.hasPlan,
      tooltip: artifacts.hasPlan ? 'plan.md exists' : 'plan.md missing',
    },
    {
      label: 'tasks',
      done: artifacts.hasTasks,
      tooltip: artifacts.hasTasks ? 'tasks.md exists' : 'tasks.md missing',
    },
    {
      label: 'impl',
      done: artifacts.hasImplementation,
      tooltip: artifacts.hasImplementation
        ? `Tasks in progress (${progressStr})`
        : 'No tasks checked yet',
    },
  ];
}
