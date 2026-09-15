import { isAlwaysConfirm, shouldEngage } from '../../../shared/autonomy';
import type { Phase, Plan } from '../../../shared/planning-types';

export function requiresApproval(
  phase: Phase,
  autonomyLevel: number,
  permissionMode: string,
): boolean {
  if (phase.isSafe || phase.risk < 20) return false;
  return permissionMode === 'auto'
    ? isAlwaysConfirm(phase.risk)
    : shouldEngage(phase.risk, autonomyLevel);
}

export function nextPendingPhase(plan: Plan): Phase | null {
  return (
    plan.phases.find(
      (phase, index) =>
        phase.status === 'pending' &&
        plan.phases
          .slice(0, index)
          .every((previous) => previous.status === 'complete' || previous.status === 'skipped'),
    ) ?? null
  );
}

export function areAllPhasesComplete(plan: Plan): boolean {
  return plan.phases.every(
    (phase) =>
      phase.status === 'complete' || phase.status === 'skipped' || phase.status === 'error',
  );
}

export function validatePhaseProgression(
  plan: Plan,
  phaseIndex: number,
): { valid: boolean; warning?: string; suggestion?: string; expectedPhase?: number } {
  const phase = plan.phases[phaseIndex];
  if (!phase) return { valid: false, warning: `Phase ${phaseIndex} not found in plan` };
  const expectedPhase = plan.phases
    .slice(0, phaseIndex)
    .findIndex((previous) => previous.status === 'pending' || previous.status === 'blocked');
  if (expectedPhase < 0) return { valid: true };
  const expected = plan.phases[expectedPhase];
  return {
    valid: true,
    expectedPhase,
    warning: `Working on Phase ${phaseIndex} but Phase ${expectedPhase} (${expected.name}) is still pending`,
    suggestion: `Consider completing Phase ${expectedPhase} first, or use ReportPhaseProgress(${expectedPhase}, 'skipped', ...) if intentionally skipping it.`,
  };
}
