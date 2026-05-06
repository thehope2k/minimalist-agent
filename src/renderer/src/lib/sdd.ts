import type { SddArtifactSet, SddFeature, SddPhase } from '../../../shared/sdd-types';

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

// ── Phase action helpers ─────────────────────────────────────────────────────

/** Maps each phase to the `/speckit.*` CLI directive that drives it. */
const PHASE_COMMANDS: Record<SddPhase, string> = {
  constitution: '/speckit.constitution',
  specify: '/speckit.specify',
  plan: '/speckit.plan',
  tasks: '/speckit.tasks',
  implement: '/speckit.implement',
  complete: '',
};

/**
 * Build the pre-composed chat message sent when a phase action button is
 * clicked. Returns an empty string when the feature is complete.
 */
export function phaseActionMessage(feature: SddFeature): string {
  const cmd = PHASE_COMMANDS[feature.currentPhase];
  if (!cmd) return '';
  if (feature.currentPhase === 'implement') {
    const p = taskProgress(feature.artifacts);
    const progress = p ? ` (${p.checked}/${p.total} tasks done)` : '';
    // Use a relative @mention path — renders as a file pill in the chat bubble
    // and gives the agent an unambiguous path to read without a discovery step.
    const tasksRef = `.specify/specs/${feature.name}/tasks.md`;
    return `Let's run ${cmd} for ${feature.name}${progress}. Open @${tasksRef} to find the next unchecked task.`;
  }
  return `Let's run ${cmd} for ${feature.name}.`;
}

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
