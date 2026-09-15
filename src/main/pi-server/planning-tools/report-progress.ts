import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createLogger } from '../../../shared/sub-logger';
import { validateReportPhaseProgressInput } from '../../../shared/planning-types';
import { state } from '../state';
import { schema } from './schema';

const log = createLogger('pi-server');

export function createReportPhaseProgressTool(sessionId: string): ToolDefinition<any, any> {
  return {
    name: 'ReportPhaseProgress',
    label: 'Report phase progress',
    description:
      'Report progress on the current phase. Call after completing actions or discovering key findings.',
    parameters: {
      type: 'object' as const,
      properties: {
        phase_index: schema.number('Phase index (0-based)', 0, 100),
        status: {
          type: 'string' as const,
          enum: ['running', 'complete', 'blocked'],
          description: 'Phase status',
        },
        findings: schema.string('What was discovered or accomplished'),
        suggests_revision: {
          type: 'boolean' as const,
          description: 'Whether plan should be revised based on findings',
        },
      },
      required: ['phase_index', 'status', 'findings', 'suggests_revision'],
    },
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const input = validateReportPhaseProgressInput(params);
        const plan = state.planManager!.getActivePlan(sessionId);
        if (!plan) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'No active plan found for this session' }],
            details: {},
          };
        }
        const phase = plan.phases[input.phase_index];
        if (!phase) {
          return {
            isError: true,
            content: [
              { type: 'text' as const, text: `Phase index ${input.phase_index} not found in plan` },
            ],
            details: {},
          };
        }
        const statusMap = {
          running: 'running' as const,
          complete: 'complete' as const,
          blocked: 'blocked' as const,
        };
        if (input.status === 'running') {
          const needsApproval = state.planManager!.checkAndRequestApproval(
            sessionId,
            phase.id,
            state.autonomyLevel,
            state.permissionMode,
          );
          if (needsApproval) {
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
        if (input.status === 'running') state.currentPhaseId = phase.id;
        else if (input.status === 'complete') state.currentPhaseId = undefined;
        const revisionNeeded =
          input.suggests_revision &&
          state.planManager!.shouldRevise(sessionId, phase.id, input.findings);
        const progression = state.planManager!.validatePhaseProgression(
          sessionId,
          input.phase_index,
        );
        let responseText = `Phase ${input.phase_index} (${phase.name}) status: ${input.status}`;
        if (progression.warning) {
          responseText += `\n\n⚠️  ${progression.warning}`;
          if (progression.suggestion) responseText += `\n${progression.suggestion}`;
        }
        if (revisionNeeded)
          responseText +=
            '\n\nRevision recommended based on findings. Use RevisePlan to update remaining phases.';
        if (input.status === 'complete') {
          const nextPhase = state.planManager!.getNextPendingPhase(sessionId);
          responseText += nextPhase
            ? `\n\nNext: Phase ${nextPhase.index} - ${nextPhase.name}`
            : '\n\nAll phases complete!';
        }
        return {
          isError: false,
          content: [{ type: 'text' as const, text: responseText }],
          details: {
            phase_index: input.phase_index,
            status: input.status,
            revision_needed: revisionNeeded,
          },
        };
      } catch (error: any) {
        if (state.planManager && params && typeof params === 'object' && 'phase_index' in params) {
          try {
            const phaseIndex = (params as any).phase_index;
            const plan = state.planManager.getActivePlan(sessionId);
            if (plan && typeof phaseIndex === 'number') {
              const phase = plan.phases[phaseIndex];
              if (phase)
                state.planManager.recordPhaseError(
                  sessionId,
                  phase.id,
                  `Failed to report progress: ${error.message}`,
                );
            }
          } catch (recordError) {
            log.error('Failed to record phase error:', recordError);
          }
        }
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to report phase progress: ${error.message}` },
          ],
          details: {},
        };
      }
    },
  };
}
