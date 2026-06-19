// Pi subprocess server — runs `@earendil-works/pi-coding-agent`'s
// AgentSession in-process and bridges it to the main process via JSONL
// over stdin/stdout.
//
// Built as a SECOND main-process bundle (see `electron.vite.config.ts`)
// and spawned by `agent/backends/pi/agent.ts` per chat session.
//
// Responsibilities:
//   - Boot a Pi AgentSession with the user's chosen model + system prompt
//   - Stream Pi events back as adapted `AgentChatEvent`s (in-process adapter)
//   - Permission-gate every non-readonly tool by round-tripping
//     `pre_tool_use_request` / `pre_tool_use_response` with main
//   - Surface auth failures as `auth_required` so main can refresh the
//     OAuth token and push it back via `token_update` without restart
//   - Handle one-shot `mini_completion` (title gen / cheap completions)
//     and `llm_query` (call_llm tool backend) without the agent loop
//
// All state lives in the `state` object below — there's exactly one
// AgentSession per subprocess, and one subprocess per chat session.

import { createInterface } from 'node:readline';
import {
  createAgentSession,
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  ModelRegistry,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getModel, completeSimple, type ThinkingLevel } from '@earendil-works/pi-ai';
import { getOAuthProvider } from '@earendil-works/pi-ai/oauth';
import { adaptPiEvent } from './event-adapter';
import { createPiWebFetchTool, createPiWebSearchTool } from './web-tools';
import { createPiAgentTool } from '../agent/backends/pi/agent-tool';
import type {
  MsgAuthRequired,
  MsgEvent,
  MsgFatalError,
  MsgInit,
  MsgLlmQuery,
  MsgLlmQueryResult,
  MsgMiniCompletion,
  MsgMiniCompletionResult,
  MsgPreToolUseRequest,
  MsgPreToolUseResponse,
  MsgCollaborationRequest,
  MsgCollaborationResponse,
  MsgPrompt,
  MsgReady,
  MsgSessionIdUpdate,
  MsgTokenUpdate,
  PiAuthProvider,
  PiPermissionMode,
  PiThinkingLevel,
  SubprocessInbound,
  SubprocessOutbound,
} from '../agent/backends/pi/protocol';
import { fileURLToPath } from 'node:url';
import type { LoadedAgent } from '../agents/types';
import { PlanManager } from '../agent/planning/manager';
import {
  validateCreatePlanInput,
  validateReportPhaseProgressInput,
  validateRevisePlanInput,
} from '../../shared/planning-types';
import { createLogger } from '../../shared/sub-logger';
import {
  initOtel,
  shutdownOtel,
  startSpan,
  withSpan,
  captureContent,
  isOtelEnabled,
  recordException,
  safeAttr,
  setAttrs,
  SpanKind,
  SpanStatusCode,
  type Span,
} from '../../shared/otel';
import { context as otelContext, type Context } from '@opentelemetry/api';

const log = createLogger('pi-server');

// Derive the path to this pi-server bundle for spawning agent subprocesses
const PI_SERVER_PATH = fileURLToPath(import.meta.url);

/* ============================================================ */
/*  stdio framing                                                */
/* ============================================================ */

function send(msg: SubprocessOutbound): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function fatal(message: string): never {
  const m: MsgFatalError = { type: 'error', message };
  send(m);
  process.exit(1);
}

function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}

/* ============================================================ */
/*  Per-process state                                            */
/* ============================================================ */

interface State {
  init?: MsgInit;
  authStorage?: AuthStorage;
  session?: AgentSession;
  resourceLoader?: DefaultResourceLoader;
  /** Available agents passed from main process. */
  availableAgents: LoadedAgent[];
  /** Mutable array passed by reference into resourceLoader — update in-place
   *  before reload() so per-turn context takes effect without recreating
   *  the session. */
  appendArr: string[];
  /** Last value pushed into appendArr — avoids a redundant reload(). */
  lastAppend?: string;
  model?: ReturnType<typeof getModel>;
  permissionMode: PiPermissionMode;
  autonomyLevel: number;
  currentTurnId?: string;
  unsubscribe?: () => void;
  pendingPermission: Map<
    string,
    { resolve: (r: MsgPreToolUseResponse) => void }
  >;
  pendingCollaboration: Map<
    string,
    { resolve: (r: MsgCollaborationResponse) => void }
  >;
  planManager?: PlanManager;
  currentPhaseId?: string; // Track active phase for error attribution
  turnAbort?: AbortController;
  shuttingDown?: boolean;
  /** OTel span + context for the in-flight turn; child spans nest under it. */
  turnSpan?: Span;
  turnContext?: Context;
  /** OTel span for the in-flight provider/model request (one per assistant
   *  message; a tool loop produces several per turn). */
  modelSpan?: Span;
  /** Wall-clock start of the current model span, for time-to-first-token. */
  modelSpanStartMs?: number;
  modelFirstTokenSeen?: boolean;
  /** Per-turn model-call count, surfaced on the invoke_agent span. */
  modelRequestCount?: number;
  /** Accumulated assistant text for opt-in content capture on the turn span. */
  turnAssistantText?: string;
}

const state: State = {
  permissionMode: 'auto',
  autonomyLevel: 50, // Default, will be overridden by init
  pendingPermission: new Map(),
  pendingCollaboration: new Map(),
  appendArr: [],
  availableAgents: [],
  // planManager initialized in handleInit with sessions directory
};

/**
 * Tracks the live `session.prompt()` promise so that a new prompt message
 * arriving while the previous one is still in its resolution tail (after the
 * terminal subscription event fired but before the promise settled) can wait
 * instead of calling `session.prompt()` concurrently and hitting the
 * "Agent is already processing" error from the Pi SDK.
 */
let activePromptPromise: Promise<void> | null = null;

/* ============================================================ */
/*  Thinking-level mapping                                       */
/* ============================================================ */

/** Our protocol's level → Pi's accepted set ('minimal'..'xhigh').
 *  'off' has no Pi equivalent → 'minimal'. 'max' clamps to 'xhigh'. */
function mapThinkingLevel(level: PiThinkingLevel): ThinkingLevel {
  if (level === 'off') return 'minimal';
  if (level === 'max') return 'xhigh';
  return level;
}

/* ============================================================ */
/*  Auth storage seeding + refresh                               */
/* ============================================================ */

async function writeAuthCredential(
  authStorage: AuthStorage,
  provider: string,
  cred: MsgInit['piAuth']['credential'] | MsgTokenUpdate['credential'],
): Promise<void> {
  if (cred.type === 'oauth') {
    await authStorage.set(provider, {
      type: 'oauth',
      access: cred.access,
      refresh: cred.refresh,
      expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
    } as never);
  } else {
    await authStorage.set(provider, {
      type: 'api_key',
      key: cred.key,
    } as never);
  }
}

/* ============================================================ */
/*  Tool wrappers — permission gate                              */
/* ============================================================ */

const READ_ONLY_TOOL_NAMES = new Set([
  'read',
  'grep',
  'find',
  'ls',
  'web_fetch',
  'web_search',
]);

/**
 * Wrap a Pi tool definition so its `execute` first asks main for
 * permission via `pre_tool_use_request`. Read-only tools are exempt
 * from the round-trip in `auto` mode (the gate adds latency for nothing).
 */
function wrapWithPermissionGate(
  base: ToolDefinition<any, any, any>,
): ToolDefinition<any, any, any> {
  const originalExecute = base.execute.bind(base);
  return {
    ...base,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Auto + readonly = fast path. Auto + write = also auto-allow but
      // still emit the request so main can record what happened. We
      // skip the round-trip entirely for a pure latency win.
      if (state.permissionMode === 'auto') {
        return originalExecute(toolCallId, params, signal, onUpdate, ctx);
      }

      // Read-only tools always pass even in plan/ask.
      if (READ_ONLY_TOOL_NAMES.has(base.name.toLowerCase())) {
        return originalExecute(toolCallId, params, signal, onUpdate, ctx);
      }

      const decision = await requestPermission(toolCallId, base.name, params);

      if (decision.action === 'block') {
        // IMPORTANT: Pi's agent-loop only flags `isError: true` on the
        // tool_execution_end event when execute() *throws*. Returning
        // `{ isError: true, content: [...] }` is silently treated as
        // success — the UI then draws a green check on a tool call that
        // never actually ran (e.g. plan-mode-blocked Edit). Throwing
        // routes us through the agent-loop's error path so isError flows
        // through to tool_execution_end → tool_result → DiffPart.
        throw new Error(decision.reason ?? 'Tool execution denied.');
      }

      const finalParams = decision.action === 'modify' ? decision.input : params;
      return originalExecute(toolCallId, finalParams, signal, onUpdate, ctx);
    },
  };
}

/**
 * Wrap a tool definition so each execution is a GenAI `execute_tool` span
 * (span name `execute_tool <name>`) nested under the active turn span. Applied
 * to every tool (builtin, web, agent, collaboration, planning) so the trace is
 * uniform. When tracing is disabled `withSpan` uses the API's no-op tracer, so
 * this is effectively free.
 */
function instrumentTool(
  base: ToolDefinition<any, any, any>,
): ToolDefinition<any, any, any> {
  const originalExecute = base.execute.bind(base);
  // Agent delegation + collaboration/planning tools are MA-internal; the file/
  // web/bash tools are the model-callable "function" tools.
  const toolType = base.name === 'Agent' ? 'extension' : 'function';
  return {
    ...base,
    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      withSpan(
        `execute_tool ${base.name}`,
        async (span) => {
          setAttrs(span, {
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.tool.name': base.name,
            'gen_ai.tool.type': toolType,
            'gen_ai.tool.call.id': String(toolCallId),
            'gen_ai.tool.description': (base as { description?: string }).description,
            'gen_ai.conversation.id': state.init?.sessionId,
          });
          if (captureContent()) {
            span.setAttribute('gen_ai.tool.call.arguments', safeAttr(params));
          }
          try {
            const res = await originalExecute(toolCallId, params, signal, onUpdate, ctx);
            if (res && (res as { isError?: boolean }).isError) {
              span.setAttribute('error.type', 'tool_error');
              span.setStatus({ code: SpanStatusCode.ERROR, message: 'tool returned isError' });
            }
            if (captureContent() && res && (res as { content?: unknown }).content) {
              span.setAttribute(
                'gen_ai.tool.call.result',
                safeAttr((res as { content?: unknown }).content),
              );
            }
            return res;
          } catch (err) {
            span.setAttribute('error.type', err instanceof Error ? err.name : 'Error');
            throw err;
          }
        },
        // Parent explicitly to the turn context so nesting holds even if the
        // SDK's tool callback runs outside the turn's async context.
        { parentContext: state.turnContext },
      ),
  };
}

function requestPermission(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Promise<MsgPreToolUseResponse> {
  return new Promise((resolve) => {
    const requestId = `pi_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingPermission.set(requestId, { resolve });

    const turnId = state.currentTurnId ?? '';
    const req: MsgPreToolUseRequest = {
      type: 'pre_tool_use_request',
      requestId,
      turnId,
      toolCallId,
      toolName,
      input,
    };
    send(req);

    // If the turn is aborted before main responds, auto-block so the
    // tool throws instead of hanging.
    state.turnAbort?.signal.addEventListener('abort', () => {
      const pending = state.pendingPermission.get(requestId);
      if (pending) {
        state.pendingPermission.delete(requestId);
        pending.resolve({
          type: 'pre_tool_use_response',
          requestId,
          action: 'block',
          reason: 'Turn aborted',
        });
      }
    });
  });
}

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
    const response = await requestCollaboration(
      state.currentTurnId || '',
      sessionId,
      engagementType,
      params,
    );
    const result = response.response as any;
    
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

function createCollaborationTools(sessionId: string): ToolDefinition<any, any, any>[] {
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
          context: schema.string('Additional context about why this decision matters'),
        },
        required: ['question', 'alternatives'],
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
          context: schema.string('Why this preference matters'),
        },
        required: ['question', 'options'],
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

/**
 * Create planning workflow tools.
 */
function createPlanningTools(sessionId: string): ToolDefinition<any, any, any>[] {
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

function buildWrappedTools(
  cwd: string,
  agentContext?: {
    sessionId: string;
    sessionPath: string;
    piServerPath: string;
    availableAgents: LoadedAgent[];
    piAuthProvider: string; // Will be validated as PiAuthProvider at runtime
    sessionModel: string; // Parent session's model for agent resolution
    getAuth: () => Promise<{ access: string; refresh?: string; expires?: number }>;
    baseUrl?: string;
    customEndpoint?: { api: 'openai-completions' | 'anthropic-messages'; supportsImages?: boolean; contextWindow?: number; maxTokens?: number; reasoning?: boolean; thinkingFormat?: 'qwen' };
    permissionMode: 'plan' | 'auto';
  },
): ToolDefinition<any, any, any>[] {
  const tools: ToolDefinition<any, any, any>[] = [
    wrapWithPermissionGate(createReadToolDefinition(cwd)),
    wrapWithPermissionGate(createBashToolDefinition(cwd)),
    wrapWithPermissionGate(createEditToolDefinition(cwd)),
    wrapWithPermissionGate(createWriteToolDefinition(cwd)),
    wrapWithPermissionGate(createGrepToolDefinition(cwd)),
    wrapWithPermissionGate(createFindToolDefinition(cwd)),
    wrapWithPermissionGate(createLsToolDefinition(cwd)),
    // Web tools — read-only, but still routed through the permission
    // gate so plan/auto modes stay in control.
    wrapWithPermissionGate(createPiWebFetchTool()),
    wrapWithPermissionGate(createPiWebSearchTool()),
  ];

  // Add Agent tool if we have the necessary context
  if (agentContext) {
    tools.push(wrapWithPermissionGate(createPiAgentTool({
      ...agentContext,
      piAuthProvider: agentContext.piAuthProvider as PiAuthProvider,
      cwd,
    })));
  }

  // Add collaboration tools (not wrapped with permission gate - they ARE the engagement)
  tools.push(...createCollaborationTools(agentContext?.sessionId || ''));

  // Add planning tools (not wrapped with permission gate - they manage the workflow)
  tools.push(...createPlanningTools(agentContext?.sessionId || ''));

  return tools.map(instrumentTool);
}

/* ============================================================ */
/*  init                                                          */
/* ============================================================ */

async function handleInit(msg: MsgInit): Promise<void> {
  // Bring up tracing (no-op unless MA_OTEL_ENABLED) before any turn runs.
  await initOtel();
  state.init = msg;
  state.permissionMode = msg.permissionMode;
  state.autonomyLevel = msg.autonomyLevel ?? 50; // Default to 50 if not provided
  state.appendArr = msg.systemPrompt ? [msg.systemPrompt] : [];
  state.lastAppend = msg.systemPrompt ?? '';

  // Initialize PlanManager with sessions directory (parent of sessionPath)
  const sessionsDir = join(msg.sessionPath, '..');
  state.planManager = new PlanManager(sessionsDir);

  // Store available agents (passed from main process)
  state.availableAgents = (msg.availableAgents || []).map(a => ({
    slug: a.slug,
    metadata: a.metadata,
    content: a.content,
    path: a.path,
    iconPath: a.iconPath,
  }));

  const authStorage = AuthStorage.inMemory();
  if (msg.piAuth) {
    await writeAuthCredential(authStorage, msg.piAuthProvider, msg.piAuth.credential);
  }
  state.authStorage = authStorage;

  const hasCustomEndpoint = !!msg.baseUrl?.trim() && !!msg.customEndpoint;

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  let model: ReturnType<typeof getModel>;
  if (hasCustomEndpoint) {
    const modelId = msg.model;
    const rawBase = msg.baseUrl!.trim();
    // The openai-completions provider passes baseUrl directly to the OpenAI
    // SDK client which appends /chat/completions — so the URL must include
    // /v1. Append it automatically so users can type http://localhost:11434.
    const apiBase = msg.customEndpoint!.api === 'openai-completions' && !rawBase.endsWith('/v1')
      ? `${rawBase}/v1`
      : rawBase;
    // Localhost endpoints (Ollama, LM Studio) don’t need auth.
    const apiKey = isLocalhostUrl(rawBase) ? 'not-needed' : (msg.piAuth?.credential.type === 'api_key' ? msg.piAuth.credential.key : '');
    const ce = msg.customEndpoint!;
    modelRegistry.registerProvider('custom-endpoint', {
      baseUrl: apiBase,
      apiKey,
      api: ce.api,
      authHeader: true,
      models: [{
        id: modelId,
        name: modelId,
        reasoning: ce.reasoning ?? true,
        // 'qwen' forces enable_thinking:false so local Ollama Qwen3 models
        // don't stall ~30s before the first token. Remote OpenAI-compatible
        // providers (StepFun, DeepSeek, …) omit this and reason natively.
        ...(ce.thinkingFormat ? { compat: { thinkingFormat: ce.thinkingFormat } } : {}),
        input: ce.supportsImages ? ['text', 'image'] : ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: ce.contextWindow ?? 131_072,
        maxTokens: ce.maxTokens ?? 8_192,
      }],
    } as never);
    const resolved = (modelRegistry as unknown as { find: (p: string, id: string) => ReturnType<typeof getModel> | undefined })
      .find('custom-endpoint', modelId);
    if (!resolved) fatal(`Could not resolve custom-endpoint model: ${modelId}`);
    model = resolved!;
  } else {
    // Resolve the Pi model. The cast to `never` for the model id is
    // necessary because Pi's getModel<TProvider, TModelId> signature uses
    // a typed lookup; we pass model ids dynamically.
    model = getModel(msg.piAuthProvider as 'github-copilot', msg.model as never);
    
    // Validate that the model resolved successfully
    if (!model) {
      // Show common models as examples
      const exampleModels = 'gpt-5.5, gpt-5.4, claude-opus-4.7, claude-sonnet-4.6, gemini-3.5-flash';
      
      fatal(
        `Failed to resolve model "${msg.model}" for provider "${msg.piAuthProvider}". ` +
        `This usually means the model ID is invalid or not supported by this provider. ` +
        `Common models: ${exampleModels}. ` +
        `You can also use "session-default" to inherit the session model. ` +
        `Check your connection settings or agent configuration.`
      );
    }

    // CRITICAL for github-copilot: the OAuth access token carries a
    // `proxy-ep=` claim that pins requests to the user's regional API
    // host. Without applying it the request hits a default endpoint that
    // doesn't serve the model → 421 Misdirected Request.
    const provider = getOAuthProvider(msg.piAuthProvider);
    if (provider?.modifyModels && msg.piAuth?.credential.type === 'oauth') {
      const cred = msg.piAuth.credential;
      const [adjusted] = provider.modifyModels(
        [model] as never,
        {
          access: cred.access,
          refresh: cred.refresh,
          expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
        } as never,
      );
      if (adjusted) model = adjusted as typeof model;
    }
  }
  state.model = model;

  // continueRecent resumes the most recent session stored in msg.sessionPath
  // (our userData-backed dir), or creates a new one if none exists yet.
  const sessionManager = SessionManager.continueRecent(msg.cwd, msg.sessionPath);

  // Build agent context for the Agent tool
  const agentContext = {
    sessionId: msg.sessionId,
    sessionPath: msg.sessionPath,
    piServerPath: PI_SERVER_PATH,
    availableAgents: state.availableAgents,
    piAuthProvider: msg.piAuthProvider,
    sessionModel: msg.model,  // Pass parent model for session-default resolution
    getAuth: async () => {
      if (!state.authStorage) {
        throw new Error('Auth storage not initialized');
      }
      const apiKey = await state.authStorage.getApiKey(msg.piAuthProvider);
      const cred = state.authStorage.get(msg.piAuthProvider);
      if (cred?.type === 'oauth') {
        return {
          access: cred.access,
          refresh: cred.refresh,
          expires: cred.expires,
        };
      }
      return { access: apiKey || '' };
    },
    ...(hasCustomEndpoint ? {
      baseUrl: msg.baseUrl,
      customEndpoint: msg.customEndpoint,
    } : {}),
    permissionMode: msg.permissionMode as 'plan' | 'auto',
  };

  const tools = buildWrappedTools(msg.cwd, agentContext);

  const agentDir = join(homedir(), '.pi', 'agent');
  const resourceLoader = new DefaultResourceLoader({
    cwd: msg.cwd,
    agentDir,
    appendSystemPrompt: state.appendArr,
  });
  await resourceLoader.reload();
  state.resourceLoader = resourceLoader;

  const { session } = await createAgentSession({
    cwd: msg.cwd,
    model,
    // Local models are slow enough without extended thinking.
    // Force minimal for custom endpoints; honour the user's setting otherwise.
    thinkingLevel: hasCustomEndpoint ? 'minimal' : mapThinkingLevel(msg.thinkingLevel),
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader,
    noTools: 'builtin',
    customTools: tools as never,
  });
  state.session = session;
  state.unsubscribe = session.subscribe(forwardEvent);

  // Set up PlanManager event forwarding
  if (state.planManager) {
    const sessionId = msg.sessionId;
    state.planManager.on('plan-created', (plan) => {
      send({ type: 'planning:created', sessionId, plan });
    });
    state.planManager.on('plan-updated', (plan) => {
      send({ type: 'planning:updated', sessionId, plan });
    });
    state.planManager.on('phase-updated', (planId, phase) => {
      send({ type: 'planning:phase-updated', sessionId, planId, phase });
    });
    state.planManager.on('plan-revised', (plan, revision) => {
      send({ type: 'planning:revised', sessionId, plan, revision });
    });
    state.planManager.on('plan-completed', (planId) => {
      send({ type: 'planning:completed', sessionId, planId });
    });
    state.planManager.on('plan-cancelled', (planId) => {
      send({ type: 'planning:cancelled', sessionId, planId });
    });
    state.planManager.on('plan-error', (planId, error, phaseId) => {
      send({ type: 'planning:error', sessionId, planId, error, phaseId });
    });
    state.planManager.on('phase-approval-required', (planId, phase) => {
      send({ type: 'planning:approval-required', sessionId, planId, phase });
    });
  }

  const ready: MsgReady = {
    type: 'ready',
    piSessionId: session.sessionId ?? null,
  };
  send(ready);
}

/* ============================================================ */
/*  Event forwarding                                             */
/* ============================================================ */

interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

/** pi-ai normalizes every provider's usage to this shape (types.d.ts:Usage). */
function readUsage(usage: unknown): PiUsage {
  if (!usage || typeof usage !== 'object') return {};
  const u = usage as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  return {
    input: num(u.input),
    output: num(u.output),
    cacheRead: num(u.cacheRead),
    cacheWrite: num(u.cacheWrite),
    totalTokens: num(u.totalTokens),
  };
}

/** Map pi-ai StopReason → a GenAI finish_reasons value. */
function finishReason(stop?: string): string | undefined {
  if (!stop) return undefined;
  switch (stop) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'toolUse': return 'tool_calls';
    case 'error': return 'error';
    case 'aborted': return 'aborted';
    default: return stop;
  }
}

/** Hostname of the active model endpoint, for `server.address`. */
function serverAddress(): string | undefined {
  const base = (state.model as { baseUrl?: string } | undefined)?.baseUrl;
  if (!base) return undefined;
  try { return new URL(base).hostname; } catch { return undefined; }
}

interface AssistantMsg {
  usage?: unknown;
  model?: string;
  responseModel?: string;
  responseId?: string;
  provider?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: unknown;
}

function finishModelSpan(m?: AssistantMsg): void {
  const span = state.modelSpan;
  if (!span) return;
  state.modelSpan = undefined;

  const usage = readUsage(m?.usage);
  const reason = finishReason(m?.stopReason);
  // gen_ai.usage.input_tokens is the TOTAL prompt size (OpenAI-style: cached
  // tokens are a subset of the prompt, not separate from it). pi-ai reports the
  // uncached delta in `input`, so the true prompt = input + cacheRead +
  // cacheWrite. Cost/usage dashboards sum input_tokens, so reporting only the
  // uncached delta (often ~2 with prompt caching) would wildly undercount. The
  // cache split stays available in the dedicated cache_* attributes.
  const totalInput =
    usage.input === undefined &&
    usage.cacheRead === undefined &&
    usage.cacheWrite === undefined
      ? undefined
      : (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  setAttrs(span, {
    'gen_ai.response.model': m?.responseModel ?? m?.model,
    'gen_ai.response.id': m?.responseId,
    'gen_ai.response.finish_reasons': reason ? [reason] : undefined,
    'gen_ai.usage.input_tokens': totalInput,
    'gen_ai.usage.output_tokens': usage.output,
    'gen_ai.usage.cache_read_input_tokens': usage.cacheRead,
    'gen_ai.usage.cache_creation_input_tokens': usage.cacheWrite,
    'server.address': serverAddress(),
  });
  if (captureContent() && m?.content) {
    span.setAttribute('gen_ai.output.messages', safeAttr(m.content));
  }
  // Track the latest assistant text so the turn span can carry the final
  // response when content capture is on (the last non-empty wins).
  if (m?.content) {
    const text = pickTextFromMessage(m);
    if (text) state.turnAssistantText = text;
  }
  if (m?.stopReason === 'error' || m?.stopReason === 'aborted') {
    span.setAttribute('error.type', m?.stopReason === 'aborted' ? 'aborted' : 'model_error');
    span.setStatus({ code: SpanStatusCode.ERROR, message: m?.errorMessage ?? 'model error' });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

function forwardEvent(piEvent: AgentSessionEvent): void {
  if (!state.currentTurnId) return;

  const t = (piEvent as { type?: string }).type;

  // GenAI `chat` span: one per assistant message (a tool loop yields several
  // per turn). Start on the assistant message_start, close on its message_end.
  if (isOtelEnabled() && state.turnContext) {
    if (t === 'message_start') {
      const m = (piEvent as { message?: { role?: string; model?: string } }).message;
      if (m && (m.role === 'assistant' || m.model) && !state.modelSpan) {
        const model = m.model ?? state.model?.id ?? state.init?.model ?? '';
        const { span } = startSpan(`chat ${model}`, {
          kind: SpanKind.CLIENT,
          parentContext: state.turnContext,
        });
        setAttrs(span, {
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': (m as { provider?: string }).provider ?? state.init?.piAuthProvider,
          'gen_ai.system': state.init?.piAuthProvider, // deprecated alias, kept for older backends
          'gen_ai.request.model': model,
          'gen_ai.conversation.id': state.init?.sessionId,
          'gen_ai.request.max_tokens': (state.model as { maxTokens?: number } | undefined)?.maxTokens,
          'server.address': serverAddress(),
        });
        state.modelSpan = span;
        state.modelSpanStartMs = Date.now();
        state.modelFirstTokenSeen = false;
        state.modelRequestCount = (state.modelRequestCount ?? 0) + 1;
      }
    } else if (t === 'message_update' && state.modelSpan && !state.modelFirstTokenSeen) {
      const sub = (piEvent as { assistantMessageEvent?: { type?: string } }).assistantMessageEvent;
      if (sub?.type === 'text_delta' || sub?.type === 'thinking_delta') {
        state.modelFirstTokenSeen = true;
        const ttft = Date.now() - (state.modelSpanStartMs ?? Date.now());
        state.modelSpan.setAttribute('gen_ai.server.time_to_first_token', ttft / 1000);
        state.modelSpan.addEvent('gen_ai.first_token', { 'time_to_first_token_ms': ttft });
      }
    } else if (t === 'message_end' && state.modelSpan) {
      const m = (piEvent as { message?: AssistantMsg }).message;
      finishModelSpan(m);
    }
  }

  if (t === 'session_info_changed') {
    const id = state.session?.sessionId;
    if (id) {
      const u: MsgSessionIdUpdate = { type: 'session_id_update', piSessionId: id };
      send(u);
    }
    return;
  }

  // Detect auth-required errors *before* the generic adapter so main can
  // refresh the token. We still let the adapter emit the user-visible
  // error so the UI knows the turn failed.
  if (t === 'message_end' || t === 'agent_end' || t === 'turn_end') {
    const msg = (piEvent as { message?: unknown }).message as
      | { stopReason?: string; errorMessage?: string }
      | undefined;
    if (msg && (msg.stopReason === 'error' || msg.errorMessage)) {
      const text = `${msg.errorMessage ?? ''}`.toLowerCase();
      if (
        text.includes('401') ||
        text.includes('unauthorized') ||
        text.includes('expired') ||
        text.includes('invalid_token')
      ) {
        const out: MsgAuthRequired = {
          type: 'auth_required',
          turnId: state.currentTurnId,
          message: msg.errorMessage ?? 'Auth failed',
        };
        send(out);
      }
    }
  }

  const turnId = state.currentTurnId;
  const adapted = adaptPiEvent(piEvent);
  for (const ev of adapted) {
    const out: MsgEvent = { type: 'event', turnId, event: ev };
    send(out);
    if (ev.type === 'turn_done' || ev.type === 'error') {
      // Close any dangling model span before the turn span is ended.
      if (state.modelSpan) {
        try { state.modelSpan.end(); } catch { /* */ }
        state.modelSpan = undefined;
      }
      state.currentTurnId = undefined;
      state.turnAbort = undefined;
    }
  }
}

/* ============================================================ */
/*  prompt                                                        */
/* ============================================================ */

async function handlePrompt(msg: MsgPrompt): Promise<void> {
  if (!state.session) fatal('Received prompt before init');

  if (activePromptPromise) {
    await activePromptPromise;
  }

  // Update the system-prompt append when it has changed (per-turn context).
  const newAppend = msg.systemPromptAppend ?? '';
  if (newAppend !== state.lastAppend && state.resourceLoader) {
    state.appendArr.length = 0;
    if (newAppend) state.appendArr.push(newAppend);
    state.lastAppend = newAppend;
    await state.resourceLoader.reload();
  }

  state.currentTurnId = msg.turnId;
  state.turnAbort = new AbortController();

  // Open the GenAI `invoke_agent` span. Child spans (chat, execute_tool) nest
  // under its context; it stays open until session.prompt() settles below.
  state.modelRequestCount = 0;
  const { span: turnSpan, context: turnCtx } = startSpan('invoke_agent minimalist-agent', {
    attributes: {
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.agent.name': 'minimalist-agent',
      'gen_ai.provider.name': state.init?.piAuthProvider ?? '',
      'gen_ai.conversation.id': state.init?.sessionId ?? '',
      'gen_ai.request.model': state.model?.id ?? state.init?.model ?? '',
      'session.id': state.init?.sessionId ?? '',
      'turn.id': msg.turnId,
      'permission.mode': state.permissionMode,
      'autonomy.level': state.autonomyLevel,
      'pi.provider': state.init?.piAuthProvider ?? '',
    },
  });
  state.turnSpan = turnSpan;
  state.turnContext = turnCtx;
  if (captureContent()) {
    setAttrs(turnSpan, {
      'gen_ai.input.messages': safeAttr([{ role: 'user', content: msg.message }]),
      'gen_ai.system_instructions': msg.systemPromptAppend
        ? safeAttr(msg.systemPromptAppend)
        : undefined,
    });
  }

  const run = async (): Promise<void> => {
    try {
      await state.session!.prompt(msg.message, {
        images: msg.images?.map((i) => ({
          mimeType: i.mimeType,
          data: i.data,
        })) as never,
      });
      // Terminal events emit through forwardEvent; nothing else to do here.
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (state.currentTurnId) {
        // forwardEvent hasn't cleared currentTurnId yet — the turn wasn't
        // acknowledged via a subscription event, so we must emit the error.
        const out: MsgEvent = {
          type: 'event',
          turnId: state.currentTurnId,
          event: {
            type: 'error',
            error: {
              code: 'unknown_error',
              title: 'Pi runtime error',
              message,
              canRetry: false,
              originalError: message,
            },
          },
        };
        send(out);
        state.currentTurnId = undefined;
        state.turnAbort = undefined;
      } else {
        // forwardEvent already emitted a terminal event and cleared
        // currentTurnId. The error is a duplicate from the promise
        // resolution tail — log it but don't fatal, the turn is already
        // handled on main's side.
        log.error('session.prompt() threw after terminal event:', message);
      }
    }
  };

  activePromptPromise = otelContext.with(turnCtx, () => run());
  try {
    await activePromptPromise;
    turnSpan.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    recordException(turnSpan, err);
    turnSpan.setAttribute('error.type', err instanceof Error ? err.name : 'Error');
    throw err;
  } finally {
    activePromptPromise = null;
    if (state.modelSpan) {
      try { state.modelSpan.end(); } catch { /* */ }
      state.modelSpan = undefined;
    }
    // Note: token usage is deliberately NOT rolled up onto the invoke_agent
    // span. Usage lives on the per-call `chat` spans only, so a cost ledger
    // that sums every token-bearing record counts each model call exactly once
    // (a turn-level duplicate would double-count). The turn keeps the request
    // count for quick "how many model calls this turn" reads.
    turnSpan.setAttribute('minimalist_agent.llm_request_count', state.modelRequestCount ?? 0);
    if (captureContent() && state.turnAssistantText) {
      turnSpan.setAttribute(
        'gen_ai.output.messages',
        safeAttr([{ role: 'assistant', content: state.turnAssistantText }]),
      );
    }
    try { turnSpan.end(); } catch { /* */ }
    state.turnSpan = undefined;
    state.turnContext = undefined;
    state.turnAssistantText = undefined;
  }
}

/* ============================================================ */
/*  mini_completion + llm_query                                   */
/* ============================================================ */

async function handleMiniCompletion(msg: MsgMiniCompletion): Promise<void> {
  if (!state.init) {
    sendMiniError(msg.requestId, 'Subprocess not initialized.');
    return;
  }
  try {
    let model = msg.model
      ? getModel(state.init.piAuthProvider as 'github-copilot', msg.model as never)
      : state.model!;
    
    // Validate model resolved successfully
    if (msg.model && !model) {
      sendMiniError(
        msg.requestId,
        `Failed to resolve model "${msg.model}" for provider "${state.init.piAuthProvider}". ` +
        `Use a valid model ID or omit the model parameter to use the default.`
      );
      return;
    }
    
    // CRITICAL for github-copilot: a freshly-resolved model is not yet
    // pinned to the user's regional API host (the `proxy-ep=` claim in the
    // OAuth token). Without modifyModels we hit the default endpoint and
    // get 421 Misdirected Request. state.model was already adjusted at
    // init; only need to re-apply when we resolved a different one.
    if (msg.model) {
      const provider = getOAuthProvider(state.init.piAuthProvider);
      const cred = state.authStorage?.get(state.init.piAuthProvider);
      if (provider?.modifyModels && cred?.type === 'oauth') {
        const [adjusted] = provider.modifyModels(
          [model] as never,
          {
            access: cred.access,
            refresh: cred.refresh,
            expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
          } as never,
        );
        if (adjusted) model = adjusted as typeof model;
      }
    }
    // completeSimple does NOT consult authStorage on its own — we have to
    // hand it the resolved key. authStorage.getApiKey refreshes the OAuth
    // token transparently if it's expired.
    const apiKey = state.authStorage
      ? await state.authStorage.getApiKey(state.init.piAuthProvider)
      : undefined;
    const options: Record<string, unknown> = {};
    if (apiKey) options.apiKey = apiKey;
    if (msg.maxTokens !== undefined) options.maxTokens = msg.maxTokens;
    const result = await completeSimple(
      model,
      {
        systemPrompt: msg.systemPrompt,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: msg.userPrompt }],
          },
        ],
        tools: [],
      } as never,
      Object.keys(options).length > 0 ? (options as never) : undefined,
    );

    // Pull plain text out of the assistant message.
    const text = pickTextFromMessage(result);
    const out: MsgMiniCompletionResult = {
      type: 'mini_completion_result',
      requestId: msg.requestId,
      text,
    };
    send(out);
  } catch (e) {
    sendMiniError(msg.requestId, e instanceof Error ? e.message : String(e));
  }
}

function sendMiniError(requestId: string, error: string): void {
  const out: MsgMiniCompletionResult = {
    type: 'mini_completion_result',
    requestId,
    error,
  };
  send(out);
}

async function handleLlmQuery(msg: MsgLlmQuery): Promise<void> {
  // Pass-through: caller serialises a Pi-shaped Context request, we run
  // it via completeSimple, return the AssistantMessage. Wraps the
  // call_llm tool's main-side handler.
  if (!state.init || !state.model) {
    const out: MsgLlmQueryResult = {
      type: 'llm_query_result',
      requestId: msg.requestId,
      error: 'Subprocess not initialized.',
    };
    send(out);
    return;
  }
  try {
    const req = msg.request as {
      systemPrompt?: string;
      userPrompt: string;
      model?: string;
      tools?: never[];
    };
    const model = req.model
      ? getModel(state.init.piAuthProvider as 'github-copilot', req.model as never)
      : state.model;
    
    // Validate model resolved successfully
    if (req.model && !model) {
      const out: MsgLlmQueryResult = {
        type: 'llm_query_result',
        requestId: msg.requestId,
        error: `Failed to resolve model "${req.model}" for provider "${state.init.piAuthProvider}".`,
      };
      send(out);
      return;
    }
    
    const result = await completeSimple(model, {
      systemPrompt: req.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: req.userPrompt }],
        },
      ],
      tools: req.tools ?? [],
    } as never);
    const out: MsgLlmQueryResult = {
      type: 'llm_query_result',
      requestId: msg.requestId,
      result: { text: pickTextFromMessage(result) },
    };
    send(out);
  } catch (e) {
    const out: MsgLlmQueryResult = {
      type: 'llm_query_result',
      requestId: msg.requestId,
      error: e instanceof Error ? e.message : String(e),
    };
    send(out);
  }
}

function pickTextFromMessage(message: unknown): string {
  const m = message as {
    content?: Array<{ type?: string; text?: string; content?: unknown }>;
    text?: string;
  };
  if (!m) return '';
  // Top-level text field (some providers flatten to a single string).
  if (typeof m.text === 'string' && m.text.length > 0) return m.text;
  if (!m.content) return '';
  // Pull text from any block that exposes a string `text` field — covers
  // 'text' blocks, 'output_text' blocks, and providers that don't tag the
  // type at all but include a `.text` property.
  const out = m.content
    .filter((b) => b && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (out.length > 0) return out;
  // Last-ditch: some providers wrap text in a nested `content` array.
  for (const b of m.content) {
    if (b && Array.isArray((b as { content?: unknown }).content)) {
      const inner = pickTextFromMessage(b);
      if (inner) return inner;
    }
  }
  return '';
}

/* ============================================================ */
/*  Dispatch                                                      */
/* ============================================================ */

async function dispatch(msg: SubprocessInbound): Promise<void> {
  switch (msg.type) {
    case 'init':
      await handleInit(msg);
      return;

    case 'prompt':
      await handlePrompt(msg);
      return;

    case 'set_model':
      if (state.init) {
        try {
          let newModel = getModel(
            state.init.piAuthProvider as 'github-copilot',
            msg.model as never,
          );
          
          // Validate model resolved successfully
          if (!newModel) {
            log.error(
              `Failed to resolve model "${msg.model}" for provider "${state.init.piAuthProvider}". ` +
              `Model change ignored.`
            );
            return;
          }
          
          // Apply modifyModels for providers that pin a regional endpoint
          // (e.g. github-copilot proxy-ep claim).
          const provider = getOAuthProvider(state.init.piAuthProvider);
          const cred = state.authStorage?.get(state.init.piAuthProvider);
          if (provider?.modifyModels && cred?.type === 'oauth') {
            const [adjusted] = provider.modifyModels([newModel] as never, cred as never);
            if (adjusted) newModel = adjusted as typeof newModel;
          }
          state.model = newModel;
          // Propagate to the live session so the next prompt uses the new model.
          if (state.session) {
            await state.session.setModel(newModel as never);
          }
        } catch (e) {
          log.error('set_model failed:', e);
        }
      }
      return;

    case 'set_thinking_level':
      // Pi clamps internally; nothing we can push without recreating
      // the session. Stored for future turns.
      if (state.init) state.init.thinkingLevel = msg.level;
      return;

    case 'set_permission_mode':
      state.permissionMode = msg.mode;
      return;

    case 'token_update':
      if (state.authStorage && state.init) {
        await writeAuthCredential(
          state.authStorage,
          state.init.piAuthProvider,
          msg.credential,
        );
        // Refresh the model's baseUrl from the new access token's
        // proxy-ep claim; expired tokens may rotate to a different host.
        if (state.model && msg.credential.type === 'oauth') {
          const provider = getOAuthProvider(state.init.piAuthProvider);
          if (provider?.modifyModels) {
            const cred = msg.credential;
            const [adjusted] = provider.modifyModels(
              [state.model] as never,
              {
                access: cred.access,
                refresh: cred.refresh,
                expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
              } as never,
            );
            if (adjusted && adjusted.baseUrl !== state.model.baseUrl) {
              // CRITICAL FIX for 421 Misdirected Request:
              // When proxy-ep changes (token refresh, regional rotation), we MUST
              // recreate the session so its HTTP client uses the new baseUrl.
              // The session initializes an HTTP client on creation and caches it;
              // updating state.model.baseUrl alone doesn't update the live client.
              const oldBaseUrl = state.model.baseUrl;
              state.model = adjusted as typeof state.model;
              
              log.debug(`Token refresh changed baseUrl: ${oldBaseUrl} → ${state.model.baseUrl}`);
              log.debug(`Recreating session to apply new regional endpoint...`);
              
              // Destroy old session
              if (state.session) {
                try { state.unsubscribe?.(); } catch { /* */ }
              }
              
              // Recreate session with updated model
              const sessionManager = SessionManager.continueRecent(state.init.cwd, state.init.sessionPath);
              const { session } = await createAgentSession({
                cwd: state.init.cwd,
                model: state.model,
                thinkingLevel: mapThinkingLevel(state.init.thinkingLevel),
                authStorage: state.authStorage,
                modelRegistry: ModelRegistry.inMemory(state.authStorage),
                sessionManager,
                resourceLoader: state.resourceLoader!,
                noTools: 'builtin',
                customTools: buildWrappedTools(state.init.cwd, {
                  sessionId: state.init.sessionId,
                  sessionPath: state.init.sessionPath,
                  piServerPath: PI_SERVER_PATH,
                  availableAgents: state.availableAgents,
                  piAuthProvider: state.init.piAuthProvider,
                  sessionModel: state.init.model,
                  getAuth: async () => {
                    const apiKey = await state.authStorage!.getApiKey(state.init!.piAuthProvider);
                    const cred = state.authStorage!.get(state.init!.piAuthProvider);
                    if (cred?.type === 'oauth') {
                      return {
                        access: cred.access,
                        refresh: cred.refresh,
                        expires: cred.expires,
                      };
                    }
                    return { access: apiKey || '' };
                  },
                  permissionMode: state.permissionMode,
                }) as never,
              });
              state.session = session;
              state.unsubscribe = session.subscribe(forwardEvent);
              
              log.debug(`Session recreated with new baseUrl`);
            } else if (adjusted) {
              state.model = adjusted as typeof state.model;
            }
          }
        }
      }
      return;

    case 'abort':
      try { state.session?.abort(); } catch { /* */ }
      state.turnAbort?.abort();
      return;

    case 'pre_tool_use_response': {
      const pending = state.pendingPermission.get(msg.requestId);
      if (!pending) return;
      state.pendingPermission.delete(msg.requestId);
      
      // If user approved a tool in plan mode, auto-switch to auto mode
      if (msg.action === 'allow' && state.permissionMode === 'plan') {
        log.debug('Approved tool in plan mode - switching to auto mode');
        state.permissionMode = 'auto';
        
        // Notify main process about mode change so UI updates
        send({
          type: 'permission_mode_changed',
          sessionId: state.init?.sessionId ?? '',
          mode: 'auto',
        });
      }
      
      pending.resolve(msg);
      return;
    }

    case 'collaboration_response': {
      const pending = state.pendingCollaboration.get(msg.requestId);
      if (!pending) return;
      state.pendingCollaboration.delete(msg.requestId);
      pending.resolve(msg);
      return;
    }

    case 'planning:approval-response': {
      // Handle approval/denial from user
      const { sessionId, phaseId, approved, notes } = msg;
      
      if (!state.planManager) {
        log.warn('Approval response received but planManager not initialized');
        return;
      }
      
      try {
        if (approved) {
          state.planManager.approvePhase(sessionId, phaseId, notes);
        } else {
          state.planManager.denyPhase(sessionId, phaseId, notes);
        }
      } catch (error) {
        log.error('Failed to handle approval response:', error);
      }
      
      return;
    }

    case 'steer': {
      // Inject a user message into the in-flight turn. Pi's AgentSession
      // exposes streamingBehavior: 'steer' which interrupts the model
      // mid-step and re-prompts with the combined context.
      if (!state.session) return;
      try {
        await state.session.prompt(msg.message, {
          streamingBehavior: 'steer',
          images: msg.images,
        } as never);
      } catch (e) {
        log.error('steer failed:', e);
      }
      return;
    }

    case 'mini_completion':
      await handleMiniCompletion(msg);
      return;

    case 'llm_query':
      await handleLlmQuery(msg);
      return;

    case 'shutdown':
      state.shuttingDown = true;
      try { state.unsubscribe?.(); } catch { /* */ }
      try { state.session?.dispose(); } catch { /* */ }
      await shutdownOtel();
      process.exit(0);
  }
}

/* ============================================================ */
/*  Entrypoint                                                    */
/* ============================================================ */

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let parsed: SubprocessInbound;
  try {
    parsed = JSON.parse(line) as SubprocessInbound;
  } catch (e) {
    fatal(`Bad JSONL on stdin: ${e instanceof Error ? e.message : e}`);
  }
  dispatch(parsed).catch((e) => {
    const m = e instanceof Error ? e.message : String(e);
    if (state.currentTurnId) {
      const out: MsgEvent = {
        type: 'event',
        turnId: state.currentTurnId,
        event: {
          type: 'error',
          error: {
            code: 'unknown_error',
            title: 'Subprocess error',
            message: m,
            canRetry: false,
            originalError: m,
          },
        },
      };
      send(out);
      state.currentTurnId = undefined;
    } else {
      fatal(m);
    }
  });
});

rl.on('close', () => {
  if (!state.shuttingDown) process.exit(0);
});
