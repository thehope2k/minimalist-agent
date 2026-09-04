// RequestDecision / RequestPreference / RequestFeedback / RequestGuidance /
// RequestApproval — the "intelligent collaboration" tool set. Not routed
// through the permission gate (tool-wrapping.ts) since they ARE the
// engagement mechanism, not a side effect to gate.
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createLogger } from '../../shared/sub-logger';
import { shouldEngage } from '../../shared/autonomy';
import { state } from './state';
import { send } from './transport';
import type { MsgCollaborationRequest, MsgCollaborationResponse } from '../agent-runtime/backends/pi/protocol';

const log = createLogger('pi-server');

function requestCollaboration(
  turnId: string,
  sessionId: string,
  engagementType: 'decision' | 'preference' | 'feedback' | 'guidance' | 'approval',
  payload: unknown,
): Promise<MsgCollaborationResponse> {
  return new Promise((resolve) => {
    const requestId = `collab_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingCollaboration.set(requestId, { resolve });

    const req: MsgCollaborationRequest = {
      type: 'collaboration_request',
      requestId,
      turnId,
      sessionId,
      engagementType,
      payload,
    };
    send(req);

    // If the turn is aborted before main responds, auto-deny
    state.turnAbort?.signal.addEventListener('abort', () => {
      const pending = state.pendingCollaboration.get(requestId);
      if (pending) {
        state.pendingCollaboration.delete(requestId);
        pending.resolve({
          type: 'collaboration_response',
          requestId,
          response: {
            type: engagementType,
            decision: 'denied',
            custom_response: 'Turn aborted',
          },
        });
      }
    });
  });
}

/**
 * When the user grants an approval (a risky-operation approval, a tool-use
 * approval, or a plan phase approval) while the session is still in plan mode,
 * promote the session to auto mode. Plan mode blocks every write tool, so
 * without this the agent stays stuck — it asked, the user said yes, yet the
 * very next write is still denied by the plan-mode guard.
 *
 * No-op when already in auto mode. Notifies the main process so the UI and the
 * cached per-turn permission contexts update too.
 */
export function promoteToAutoAfterApproval(): void {
  if (state.permissionMode !== 'plan') return;
  log.debug('User granted approval in plan mode - switching to auto mode');
  state.permissionMode = 'auto';
  send({
    type: 'permission_mode_changed',
    sessionId: state.init?.sessionId ?? '',
    mode: 'auto',
  });
}

/**
 * Helper to create collaboration tool executor with common response handling.
 */
function createCollaborationExecutor(
  sessionId: string,
  engagementType: 'decision' | 'preference' | 'feedback' | 'guidance' | 'approval',
  formatResponse: (result: any) => string,
) {
  return async (
    _toolCallId: string,
    params: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: any,
    _ctx: any,
  ) => {
    // Autonomy contract enforcement: in auto mode, a risk that sits within the
    // user's autonomy budget should NOT interrupt them. We can't stop the model
    // from *calling* RequestApproval, but we can make a below-threshold call a
    // cheap no-op — auto-approving and telling the model it didn't need to ask.
    // This turns the autonomy slider into a guarantee instead of a prose hint.
    // (Plan mode is exempt: there the user wants to review everything.)
    if (engagementType === 'approval' && state.permissionMode === 'auto') {
      const risk = Number((params as { risk_level?: unknown })?.risk_level ?? 0);
      if (!shouldEngage(risk, state.autonomyLevel)) {
        log.debug(
          `Auto-approved RequestApproval (risk ${risk} < autonomy ${state.autonomyLevel}) without prompting`,
        );
        return {
          isError: false,
          content: [
            {
              type: 'text' as const,
              text: `Auto-approved: risk ${risk} is within the user's autonomy budget (${state.autonomyLevel}). You did not need to ask — proceeding. Reserve RequestApproval for risk ≥ ${state.autonomyLevel} or genuinely irreversible operations.`,
            },
          ],
          details: {},
        };
      }
    }

    const response = await requestCollaboration(
      state.currentTurnId || '',
      sessionId,
      engagementType,
      params,
    );
    const result = response.response as any;

    // Dialogic escape hatch: the user chose "Discuss first" instead of picking a
    // lane. Return control to plain conversation — silence here is NOT consent.
    if (result.decision === 'defer') {
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `User wants to discuss before deciding${
              result.custom_response ? `: ${result.custom_response}` : ''
            }. Do NOT implement or take action yet — continue the conversation and help them think it through.`,
          },
        ],
        details: {},
      };
    }

    // For approval, check if denied
    if (engagementType === 'approval' && result.decision === 'denied') {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `User denied this operation${
              result.custom_response ? `: ${result.custom_response}` : ''
            }`,
          },
        ],
        details: {},
      };
    }

    // The user approved a risky operation while in plan mode → promote to auto
    // so the operation they just authorized can actually run.
    if (engagementType === 'approval') {
      promoteToAutoAfterApproval();
    }

    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: formatResponse(result),
        },
      ],
      details: {},
    };
  };
}

/**
 * Schema helpers for collaboration tool parameters.
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
  object: (description?: string) => ({
    type: 'object' as const,
    ...(description && { description }),
  }),
  array: <T>(items: T, min: number, max: number) => ({
    type: 'array' as const,
    items,
    minItems: min,
    maxItems: max,
  }),
};

export function createCollaborationTools(sessionId: string): ToolDefinition<any, any>[] {
  return [
    {
      name: 'RequestDecision',
      label: 'Request user decision',
      description: 'Ask user to decide between multiple valid alternatives',
      parameters: {
        type: 'object' as const,
        properties: {
          question: schema.string('Clear question to ask the user'),
          alternatives: schema.array(
            {
              type: 'object' as const,
              properties: {
                name: schema.string('Option name'),
                description: schema.string('Option description'),
                pros: schema.stringArray('Advantages'),
                cons: schema.stringArray('Disadvantages'),
              },
              required: ['name', 'description', 'pros', 'cons'],
            },
            2,
            5,
          ),
          recommended: schema.string('Your recommended option'),
          context: schema.string('Why this decision matters now — the situation/constraint that makes it non-trivial. Always fill this in; the dialog shown to the user has no other place to surface your reasoning.'),
        },
        required: ['question', 'alternatives', 'context'],
      },
      execute: createCollaborationExecutor(sessionId, 'decision', (result) =>
        `User selected: ${result.selected_option || result.custom_response || 'no_selection'}${
          result.custom_response ? `\n\nUser response: ${result.custom_response}` : ''
        }`,
      ),
    },
    {
      name: 'RequestPreference',
      label: 'Request user preference',
      description: "Ask for user's subjective preference",
      parameters: {
        type: 'object' as const,
        properties: {
          question: schema.string('Clear question about preference'),
          options: schema.array(
            {
              type: 'object' as const,
              properties: {
                name: schema.string('Option name'),
                description: schema.string('Option description'),
              },
              required: ['name', 'description'],
            },
            2,
            4,
          ),
          context: schema.string('Why this preference matters — what makes the options equivalent/subjective. Always fill this in; the dialog shown to the user has no other place to surface your reasoning.'),
        },
        required: ['question', 'options', 'context'],
      },
      execute: createCollaborationExecutor(sessionId, 'preference', (result) =>
        `User preference: ${result.selected_option || result.custom_response || 'no_selection'}${
          result.custom_response ? `\n\nDetails: ${result.custom_response}` : ''
        }`,
      ),
    },
    {
      name: 'RequestFeedback',
      label: 'Request user feedback',
      description: 'Request feedback on completed work',
      parameters: {
        type: 'object' as const,
        properties: {
          work_completed: schema.string('Summary of work completed'),
          preview: schema.string('Preview of the work (code snippet, file content, etc.)'),
          specific_questions: schema.stringArray('Specific questions to ask about the work'),
        },
        required: ['work_completed'],
      },
      execute: createCollaborationExecutor(sessionId, 'feedback', (result) =>
        `User feedback: ${result.feedback || result.custom_response || 'No feedback provided'}`,
      ),
    },
    {
      name: 'RequestGuidance',
      label: 'Request user guidance',
      description: 'Request guidance on trade-offs and priorities',
      parameters: {
        type: 'object' as const,
        properties: {
          situation: schema.string('Description of the situation requiring guidance'),
          trade_offs: schema.array(
            {
              type: 'object' as const,
              properties: {
                option: schema.string('Trade-off option'),
                pros: schema.stringArray('Advantages'),
                cons: schema.stringArray('Disadvantages'),
              },
              required: ['option', 'pros', 'cons'],
            },
            2,
            4,
          ),
          what_guidance_needed: schema.string('What specific guidance you need from the user'),
        },
        required: ['situation', 'trade_offs', 'what_guidance_needed'],
      },
      execute: createCollaborationExecutor(sessionId, 'guidance', (result) =>
        `User guidance: ${result.custom_response || result.guidance || 'No guidance provided'}`,
      ),
    },
    {
      name: 'RequestApproval',
      label: 'Request operation approval',
      description: 'Request approval for a risky operation',
      parameters: {
        type: 'object' as const,
        properties: {
          operation: schema.string('Description of the operation requiring approval'),
          risk_level: schema.number('Risk score (0-100)', 0, 100),
          risk_factors: schema.stringArray('Risk factors identified'),
          reason: schema.string('Why this operation is needed'),
          details: schema.object('Operation details (file paths, commands, etc.)'),
        },
        required: ['operation', 'risk_level', 'risk_factors', 'reason'],
      },
      execute: createCollaborationExecutor(sessionId, 'approval', (result) =>
        `Approved${
          result.custom_response ? ` - User note: ${result.custom_response}` : ''
        }`,
      ),
    },
  ];
}
