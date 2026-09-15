import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { validateCreatePlanInput } from '../../../shared/planning-types';
import { state } from '../state';
import { phaseSchema, schema } from './schema';

export function createCreatePlanTool(sessionId: string): ToolDefinition<any, any> {
  return {
    name: 'CreatePlan',
    label: 'Create execution plan',
    description:
      'Create a multi-phase execution plan for complex tasks. Use when task requires multiple steps or exploration.',
    parameters: {
      type: 'object' as const,
      properties: {
        task: schema.string('Clear description of the overall task'),
        phases: schema.array(phaseSchema, 1, 20),
        reasoning: schema.string('Why this approach was chosen'),
      },
      required: ['task', 'phases', 'reasoning'],
    },
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const input = validateCreatePlanInput(params);
        const plan = state.planManager!.createPlan(sessionId, input, state.currentTurnId);
        return {
          isError: false,
          content: [
            {
              type: 'text' as const,
              text: `Plan created successfully (ID: ${plan.id}, ${plan.phases.length} phases). Execution will proceed phase by phase.`,
            },
          ],
          details: { plan_id: plan.id, version: plan.version, phases_count: plan.phases.length },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to create plan: ${error.message}` }],
          details: {},
        };
      }
    },
  };
}
