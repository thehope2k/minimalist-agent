import type { AgentChatEvent } from '../../events';

export interface MsgReady {
  type: 'ready';
  /** Pi-assigned session id (used for resume on next run). */
  runtimeSessionId: string | null;
}

/**
 * Reports the subprocess's current long-running operation (or `undefined`
 * when idle between operations), so a stalled-subprocess watchdog on the
 * main side can name what it was waiting on instead of a generic timeout.
 */
export interface MsgOperationUpdate {
  type: 'operation_update';
  operation?: string;
}

/**
 * Pre-translated agent event — the subprocess does the Pi→AgentChatEvent
 * adaptation in-process so main never imports Pi types.
 */
export interface MsgEvent {
  type: 'event';
  turnId: string;
  event: AgentChatEvent;
}

export interface MsgPreToolUseRequest {
  type: 'pre_tool_use_request';
  requestId: string;
  turnId: string;
  /** Tool call id from Pi — used by the adapter for correlation. */
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/** Collaboration engagement request from subprocess → main. */
export interface MsgCollaborationRequest {
  type: 'collaboration_request';
  requestId: string;
  turnId: string;
  sessionId: string;
  engagementType: 'decision' | 'preference' | 'feedback' | 'guidance' | 'approval';
  payload: unknown;
}

export interface MsgMiniCompletionResult {
  type: 'mini_completion_result';
  requestId: string;
  text?: string;
  error?: string;
}

export interface MsgLlmQueryResult {
  type: 'llm_query_result';
  requestId: string;
  result?: unknown;
  error?: string;
}

export interface MsgSessionIdUpdate {
  type: 'session_id_update';
  runtimeSessionId: string;
}

export interface MsgAuthRefreshRequest {
  type: 'auth_refresh_request';
  requestId: string;
  /** The turn that triggered this refresh, if any — lets main cancel it via
   *  that turn's AbortSignal instead of only waiting out a fixed ceiling. */
  turnId?: string;
}

export interface MsgAuthRefreshResult {
  type: 'auth_refresh_result';
  requestId: string;
  credential?: { access: string; refresh: string; expires?: number };
  error?: string;
}

export interface MsgAuthRequired {
  type: 'auth_required';
  turnId?: string;
  message: string;
}

export interface MsgFatalError {
  type: 'error';
  message: string;
}

/** Planning workflow events from subprocess → main. */
export interface MsgPlanCreated {
  type: 'planning:created';
  sessionId: string;
  plan: unknown; // Plan type from planning-types.ts
}

export interface MsgPlanUpdated {
  type: 'planning:updated';
  sessionId: string;
  plan: unknown;
}

export interface MsgPhaseUpdated {
  type: 'planning:phase-updated';
  sessionId: string;
  planId: string;
  phase: unknown; // Phase type from planning-types.ts
}

export interface MsgPlanRevised {
  type: 'planning:revised';
  sessionId: string;
  plan: unknown;
  revision: unknown; // PlanRevision type from planning-types.ts
}

export interface MsgPlanCompleted {
  type: 'planning:completed';
  sessionId: string;
  planId: string;
}

export interface MsgPlanCancelled {
  type: 'planning:cancelled';
  sessionId: string;
  planId: string;
}

export interface MsgPlanError {
  type: 'planning:error';
  sessionId: string;
  planId: string;
  error: string;
  phaseId?: string;
}

export interface MsgPlanApprovalRequired {
  type: 'planning:approval-required';
  sessionId: string;
  planId: string;
  phase: unknown; // Phase type from planning-types.ts
}

export interface MsgPermissionModeChanged {
  type: 'permission_mode_changed';
  sessionId: string;
  mode: 'plan' | 'auto';
}

/** Per-server connection outcome for mcp-backed extensions, emitted once after
 *  the subprocess finishes connecting its MCP pool at init. */
export interface MsgMcpStatus {
  type: 'mcp_status';
  sessionId: string;
  servers: Array<{
    slug: string;
    transport: 'stdio' | 'http' | 'sse';
    ok: boolean;
    toolCount?: number;
    error?: string;
  }>;
}

/** A `browser_tool` command, routed from subprocess → main for execution
 *  against that session's owned browser window. */
export interface MsgBrowserToolRequest {
  type: 'browser_tool_request';
  requestId: string;
  sessionId: string;
  command: string;
}

export type SubprocessOutbound =
  | MsgReady
  | MsgOperationUpdate
  | MsgEvent
  | MsgPreToolUseRequest
  | MsgCollaborationRequest
  | MsgAuthRefreshRequest
  | MsgBrowserToolRequest
  | MsgPlanCreated
  | MsgPlanUpdated
  | MsgPhaseUpdated
  | MsgPlanRevised
  | MsgPlanCompleted
  | MsgPlanCancelled
  | MsgPlanError
  | MsgPlanApprovalRequired
  | MsgPermissionModeChanged
  | MsgMcpStatus
  | MsgMiniCompletionResult
  | MsgLlmQueryResult
  | MsgSessionIdUpdate
  | MsgAuthRequired
  | MsgFatalError;
