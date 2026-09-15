import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/log';
import type {
  CreatePlanInput,
  Phase,
  Plan,
  PlanRevision,
  RevisePlanInput,
} from '../../../shared/planning-types';

type PhaseInput = CreatePlanInput['phases'][number];

export function createPhases(
  inputs: PhaseInput[],
  startIndex: number,
  log: Logger,
  label = '',
): Phase[] {
  return inputs.map((input, offset) => {
    if (input.estimated_risk < 0 || input.estimated_risk > 100) {
      log.warn(
        `${label}phase "${input.name}" has invalid risk score ${input.estimated_risk}. Clamping to 0-100.`,
      );
      input.estimated_risk = Math.max(0, Math.min(100, input.estimated_risk));
    }
    if (input.is_safe && input.estimated_risk >= 20) {
      log.warn(
        `${label}phase "${input.name}" marked as safe but has risk ${input.estimated_risk} >= 20. Treating as non-safe.`,
      );
      input.is_safe = false;
    }
    return {
      id: randomUUID(),
      index: startIndex + offset,
      name: input.name,
      description: input.description,
      actions: input.actions,
      isSafe: input.is_safe,
      risk: input.estimated_risk,
      status: 'pending',
    };
  });
}

export function createPlan(
  input: CreatePlanInput,
  anchorTurnId: string | undefined,
  log: Logger,
): Plan {
  const now = Date.now();
  return {
    id: randomUUID(),
    anchorTurnId,
    version: 1,
    task: input.task,
    phases: createPhases(input.phases, 0, log),
    status: 'active',
    createdAt: now,
    lastUpdatedAt: now,
    revisions: [],
  };
}

export function createRevision(
  plan: Plan,
  input: RevisePlanInput,
  log: Logger,
): { phases: Phase[]; revision: PlanRevision } {
  const firstPendingIndex = plan.phases.findIndex(
    (phase) => phase.status === 'pending' || phase.status === 'blocked',
  );
  if (firstPendingIndex === -1) throw new Error('Cannot revise plan: no pending phases');
  const phases = createPhases(input.revised_phases, firstPendingIndex, log, 'Revised ');
  return {
    phases,
    revision: {
      version: plan.version + 1,
      timestamp: Date.now(),
      reason: input.reason,
      changedPhases: phases.map((phase) => phase.index),
      changeSummary: input.changes_summary,
    },
  };
}
