import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { validateRevisePlanInput } from '../../../shared/planning-types';
import { state } from '../state';
import { phaseSchema, schema } from './schema';

export function createRevisePlanTool(sessionId: string): ToolDefinition<any, any> {
  return {
    name: 'RevisePlan',
    label: 'Revise execution plan',
    description: 'Revise remaining phases based on new discoveries. Explain what changed and why.',
    parameters: {
      type: 'object' as const,
      properties: {
        reason: schema.string('Why revision is needed'),
        revised_phases: schema.array(phaseSchema, 1, 20),
        changes_summary: schema.string('Human-readable summary of changes'),
      },
      required: ['reason', 'revised_phases', 'changes_summary'],
    },
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const input = validateRevisePlanInput(params);
        const plan = state.planManager!.revisePlan(sessionId, input);
        const changedPhases = plan.revisions[plan.revisions.length - 1].changedPhases;
        const preservedCount = plan.phases.length - changedPhases.length;
        const firstNewIndex = changedPhases[0];
        const lastNewIndex = changedPhases[changedPhases.length - 1];
        const nextPhase = state.planManager!.getNextPendingPhase(sessionId);
        let responseText = `Plan revised successfully (v${plan.version}). ${input.changes_summary}`;
        responseText += '\n\nPhase indices are absolute and continuous across the whole plan:';
        if (preservedCount > 0) {
          responseText += `\n• Phases 0–${preservedCount - 1} are preserved (already complete/skipped) — do not re-run them.`;
        }
        responseText += `\n• Revised phases are now indexed ${firstNewIndex}${lastNewIndex !== firstNewIndex ? `–${lastNewIndex}` : ''} (the first item in your revised_phases list is Phase ${firstNewIndex}, not Phase 0).`;
        responseText += nextPhase
          ? `\n\nNext: Phase ${nextPhase.index} - ${nextPhase.name}. Call ReportPhaseProgress(${nextPhase.index}, 'running', ...) using this absolute index.`
          : '\n\nAll phases complete!';
        return {
          isError: false,
          content: [{ type: 'text' as const, text: responseText }],
          details: {
            plan_id: plan.id,
            old_version: plan.version - 1,
            new_version: plan.version,
            changed_phases: changedPhases,
            preserved_phase_count: preservedCount,
            next_phase_index: nextPhase?.index,
          },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to revise plan: ${error.message}` }],
          details: {},
        };
      }
    },
  };
}
