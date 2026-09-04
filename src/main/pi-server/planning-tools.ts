// CreatePlan / ReportPhaseProgress / RevisePlan — the planning workflow tool
// set. Not routed through the permission gate (tool-wrapping.ts) since they
// manage the workflow itself rather than perform a side effect to gate.
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createLogger } from '../../shared/sub-logger';
import { state } from './state';
import {
  validateCreatePlanInput,
  validateReportPhaseProgressInput,
  validateRevisePlanInput,
} from '../../shared/planning-types';

const log = createLogger('pi-server');

/**
 * Schema helpers for planning tool parameters (mirrors collaboration-tools.ts's
 * local copy — kept duplicated rather than shared to avoid a cross-file
 * coupling for four one-line object literals).
 */
const schema = {
  string: (description: string) => ({ type: 'string' as const, description }),
  number: (description: string, min: number, max: number) => ({
    type: 'number' as const,
    minimum: min,
    maximum: max,
    description,
  }),
  stringArray: (description: string) => ({
    type: 'array' as const,
    items: { type: 'string' as const },
    description,
  }),
  array: <T>(items: T, min: number, max: number) => ({
    type: 'array' as const,
    items,
    minItems: min,
    maxItems: max,
  }),
};

/**
 * Create planning workflow tools.
 */
export function createPlanningTools(sessionId: string): ToolDefinition<any, any>[] {
  return [
    {
      name: 'CreatePlan',
      label: 'Create execution plan',
      description: 'Create a multi-phase execution plan for complex tasks. Use when task requires multiple steps or exploration.',
      parameters: {
        type: 'object' as const,
        properties: {
          task: schema.string('Clear description of the overall task'),
          phases: schema.array(
            {
              type: 'object' as const,
              properties: {
                name: schema.string('Phase name'),
                description: schema.string('Phase description'),
                actions: schema.stringArray('Tools and actions to be executed'),
                estimated_risk: schema.number('Estimated risk score (0-100)', 0, 100),
                is_safe: { type: 'boolean' as const, description: 'Whether this phase is safe (read-only)' },
              },
              required: ['name', 'description', 'actions', 'estimated_risk', 'is_safe'],
            },
            1,
            20,
          ),
          reasoning: schema.string('Why this approach was chosen'),
        },
        required: ['task', 'phases', 'reasoning'],
      },
      execute: async (
        _toolCallId: string,
        params: unknown,
        _signal: AbortSignal | undefined,
        _onUpdate: any,
        _ctx: any,
      ) => {
        try {
          const input = validateCreatePlanInput(params);
          const plan = state.planManager!.createPlan(sessionId, input);

          return {
            isError: false,
            content: [
              {
                type: 'text' as const,
                text: `Plan created successfully (ID: ${plan.id}, ${plan.phases.length} phases). Execution will proceed phase by phase.`,
              },
            ],
            details: {
              plan_id: plan.id,
              version: plan.version,
              phases_count: plan.phases.length,
            },
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create plan: ${error.message}`,
              },
            ],
            details: {},
          };
        }
      },
    },
    {
      name: 'ReportPhaseProgress',
      label: 'Report phase progress',
      description: 'Report progress on the current phase. Call after completing actions or discovering key findings.',
      parameters: {
        type: 'object' as const,
        properties: {
          phase_index: schema.number('Phase index (0-based)', 0, 100),
          status: { type: 'string' as const, enum: ['running', 'complete', 'blocked'], description: 'Phase status' },
          findings: schema.string('What was discovered or accomplished'),
          suggests_revision: { type: 'boolean' as const, description: 'Whether plan should be revised based on findings' },
        },
        required: ['phase_index', 'status', 'findings', 'suggests_revision'],
      },
      execute: async (
        _toolCallId: string,
        params: unknown,
        _signal: AbortSignal | undefined,
        _onUpdate: any,
        _ctx: any,
      ) => {
        try {
          const input = validateReportPhaseProgressInput(params);
          const plan = state.planManager!.getActivePlan(sessionId);

          if (!plan) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: 'No active plan found for this session',
                },
              ],
              details: {},
            };
          }

          const phase = plan.phases[input.phase_index];
          if (!phase) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Phase index ${input.phase_index} not found in plan`,
                },
              ],
              details: {},
            };
          }

          // Update phase status
          const statusMap = {
            'running': 'running' as const,
            'complete': 'complete' as const,
            'blocked': 'blocked' as const,
          };

          // Before setting status to 'running', check if approval is required
          if (input.status === 'running') {
            const needsApproval = state.planManager!.checkAndRequestApproval(
              sessionId,
              phase.id,
              state.autonomyLevel,
              state.permissionMode
            );

            if (needsApproval) {
              // Phase requires approval - inform LLM
              return {
                isError: false,
                content: [
                  {
                    type: 'text' as const,
                    text: `Phase ${input.phase_index} (${phase.name}) requires user approval before execution.\n\nThis is a ${phase.risk >= 60 ? 'high' : 'medium'}-risk operation (risk: ${phase.risk}/100). Waiting for user to approve or deny.\n\nYou can acknowledge this and wait, or work on other tasks in the meantime.`,
                  },
                ],
                details: {
                  phase_index: input.phase_index,
                  status: 'awaiting_approval',
                  requires_approval: true,
                },
              };
            }
          }

          state.planManager!.updatePhaseStatus(
            sessionId,
            phase.id,
            statusMap[input.status],
            input.findings,
          );

          // Track current phase for error attribution
          if (input.status === 'running') {
            state.currentPhaseId = phase.id;
          } else if (input.status === 'complete') {
            state.currentPhaseId = undefined; // Phase finished
          }

          // Check if revision needed
          const revisionNeeded = input.suggests_revision &&
            state.planManager!.shouldRevise(sessionId, phase.id, input.findings);

          // Validate phase progression
          const progression = state.planManager!.validatePhaseProgression(sessionId, input.phase_index);

          let responseText = `Phase ${input.phase_index} (${phase.name}) status: ${input.status}`;

          if (progression.warning) {
            responseText += `\n\n⚠️  ${progression.warning}`;
            if (progression.suggestion) {
              responseText += `\n${progression.suggestion}`;
            }
          }

          if (revisionNeeded) {
            responseText += '\n\nRevision recommended based on findings. Use RevisePlan to update remaining phases.';
          }

          // Suggest next phase if current complete
          if (input.status === 'complete') {
            const nextPhase = state.planManager!.getNextPendingPhase(sessionId);
            if (nextPhase) {
              responseText += `\n\nNext: Phase ${nextPhase.index} - ${nextPhase.name}`;
            } else {
              responseText += '\n\nAll phases complete!';
            }
          }

          return {
            isError: false,
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
            ],
            details: {
              phase_index: input.phase_index,
              status: input.status,
              revision_needed: revisionNeeded,
            },
          };
        } catch (error: any) {
          // Record the phase error through PlanManager
          // Extract phase_index from params since input might not be defined
          if (state.planManager && params && typeof params === 'object' && 'phase_index' in params) {
            try {
              const phaseIndex = (params as any).phase_index;
              const plan = state.planManager.getActivePlan(sessionId);
              if (plan && typeof phaseIndex === 'number') {
                const phase = plan.phases[phaseIndex];
                if (phase) {
                  state.planManager.recordPhaseError(
                    sessionId,
                    phase.id,
                    `Failed to report progress: ${error.message}`
                  );
                }
              }
            } catch (recordError) {
              log.error('Failed to record phase error:', recordError);
            }
          }

          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to report phase progress: ${error.message}`,
              },
            ],
            details: {},
          };
        }
      },
    },
    {
      name: 'RevisePlan',
      label: 'Revise execution plan',
      description: 'Revise remaining phases based on new discoveries. Explain what changed and why.',
      parameters: {
        type: 'object' as const,
        properties: {
          reason: schema.string('Why revision is needed'),
          revised_phases: schema.array(
            {
              type: 'object' as const,
              properties: {
                name: schema.string('Phase name'),
                description: schema.string('Phase description'),
                actions: schema.stringArray('Tools and actions to be executed'),
                estimated_risk: schema.number('Estimated risk score (0-100)', 0, 100),
                is_safe: { type: 'boolean' as const, description: 'Whether this phase is safe (read-only)' },
              },
              required: ['name', 'description', 'actions', 'estimated_risk', 'is_safe'],
            },
            1,
            20,
          ),
          changes_summary: schema.string('Human-readable summary of changes'),
        },
        required: ['reason', 'revised_phases', 'changes_summary'],
      },
      execute: async (
        _toolCallId: string,
        params: unknown,
        _signal: AbortSignal | undefined,
        _onUpdate: any,
        _ctx: any,
      ) => {
        try {
          const input = validateRevisePlanInput(params);
          const plan = state.planManager!.revisePlan(sessionId, input);

          const changedPhases = plan.revisions[plan.revisions.length - 1].changedPhases;
          const preservedCount = plan.phases.length - changedPhases.length;
          const firstNewIndex = changedPhases[0];
          const lastNewIndex = changedPhases[changedPhases.length - 1];
          const nextPhase = state.planManager!.getNextPendingPhase(sessionId);

          // The <active_plan> awareness block is rebuilt only at the start of
          // each turn, so mid-turn the model can't see the re-indexed phases.
          // Spell out the absolute indices here so it keeps using the tracker
          // instead of assuming the revised list is 0-based (which would point
          // ReportPhaseProgress at an already-completed phase).
          let responseText = `Plan revised successfully (v${plan.version}). ${input.changes_summary}`;
          responseText += `\n\nPhase indices are absolute and continuous across the whole plan:`;
          if (preservedCount > 0) {
            responseText += `\n• Phases 0–${preservedCount - 1} are preserved (already complete/skipped) — do not re-run them.`;
          }
          responseText += `\n• Revised phases are now indexed ${firstNewIndex}${lastNewIndex !== firstNewIndex ? `–${lastNewIndex}` : ''} (the first item in your revised_phases list is Phase ${firstNewIndex}, not Phase 0).`;
          if (nextPhase) {
            responseText += `\n\nNext: Phase ${nextPhase.index} - ${nextPhase.name}. Call ReportPhaseProgress(${nextPhase.index}, 'running', ...) using this absolute index.`;
          } else {
            responseText += `\n\nAll phases complete!`;
          }

          return {
            isError: false,
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
            ],
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
            content: [
              {
                type: 'text' as const,
                text: `Failed to revise plan: ${error.message}`,
              },
            ],
            details: {},
          };
        }
      },
    },
  ];
}
