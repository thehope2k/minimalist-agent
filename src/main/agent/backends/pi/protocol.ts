// JSONL wire format between main process (PiAgent) and the Pi subprocess.
//
// One discriminated union per direction; each message is encoded as a
// single line of JSON on stdin/stdout.
//
// IMPORTANT: this file is imported by both the main process and the Pi
// subprocess entrypoint. It must remain dependency-free (no Electron,
// no Pi SDK imports — only types).

import type { AgentChatEvent } from '../../events';
import type { CompactionTuning } from '../../../../shared/compaction';

/* ============================================================ */
/*  Shared shapes                                                */
/* ============================================================ */

import type { PiAuthProvider } from '../../../../shared/pi-types';
export type { PiAuthProvider };

/** Credential shape handed to the subprocess via `init` / `token_update`. */
export type PiCredential =
  | { type: 'oauth'; access: string; refresh: string; expires?: number }
  | { type: 'api_key'; key: string };

export interface PiAuth {
  provider: PiAuthProvider | 'openai';
  credential: PiCredential;
}

/** Permission modes as the renderer expresses them. */
export type PiPermissionMode = 'plan' | 'auto';

export type PiThinkingLevel =
  | 'off'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface PiPromptImage {
  type: 'image';
  /** base64-encoded raw bytes. */
  data: string;
  mimeType: string;
}

/**
 * Fully-resolved MCP server config crossing main→subprocess. Mirror of
 * `ResolvedMcpServerConfig` in extensions/mcp-config.ts — duplicated here to
 * keep this file dependency-free (it's imported by both processes). Secrets
 * are already decrypted main-side, since the subprocess can't read the secret
 * store.
 */
export type PiMcpServerConfig =
  | {
      slug: string;
      transport: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      slug: string;
      transport: 'http' | 'sse';
      url: string;
      headers?: Record<string, string>;
    };

/* ============================================================ */
/*  Inbound messages (main → subprocess)                         */
/* ============================================================ */

export interface MsgInit {
  type: 'init';
  /** Our chat-session id; the subprocess stores Pi's session log under it. */
  sessionId: string;
  /** Absolute path of the per-session storage directory. */
  sessionPath: string;
  /** Working directory the agent operates in. */
  cwd: string;
  /** Pi model id (e.g. "claude-sonnet-4.6"). */
  model: string;
  /**
   * Whether the active model accepts image input, per the app's connection
   * metadata (live provider capability). When false, pi-server drops 'image'
   * from the resolved model's `input` so the SDK downgrades image blocks to a
   * text placeholder instead of the provider rejecting the request.
   */
  visionSupported?: boolean;
  /** Mini model used for title gen / call_llm defaults. */
  miniModel?: string;
  thinkingLevel: PiThinkingLevel;
  providerType: 'pi';
  authType: 'oauth' | 'api_key';
  piAuthProvider: PiAuthProvider | 'openai';
  /** Initial credential — refreshed mid-flight via `token_update`. */
  piAuth: PiAuth;
  /** Initial permission mode. */
  permissionMode: PiPermissionMode;
  /** Session autonomy level (0-100) for intelligent collaboration. */
  autonomyLevel?: number;
  /** Pre-rendered system prompt (preferences + project context + skills). */
  systemPrompt: string;
  /** Resume an existing Pi session if one is stored. */
  resumePiSessionId?: string;
  /** Base URL for custom/local endpoints (e.g. http://localhost:11434 or https://api.stepfun.ai/v1). */
  baseUrl?: string;
  /** Custom endpoint protocol — required when baseUrl is set. */
  customEndpoint?: {
    api: 'openai-completions' | 'anthropic-messages';
    supportsImages?: boolean;
    /** Model context window (tokens) for accurate compaction; defaults if omitted. */
    contextWindow?: number;
    /** Max output tokens; defaults if omitted. */
    maxTokens?: number;
    /** Whether the model supports extended thinking / reasoning effort. */
    reasoning?: boolean;
    /**
     * Thinking payload quirk. 'qwen' forces enable_thinking:false for local
     * Ollama Qwen3 models (avoids a ~30s stall). Omit for providers that
     * handle reasoning natively (StepFun, DeepSeek, …).
     */
    thinkingFormat?: 'qwen';
  };
  /** Available agents (serialized from main process) — used by Agent tool. */
  availableAgents?: Array<{
    slug: string;
    metadata: {
      name: string;
      description: string;
      model?: string;
      tools?: string[];
      permissionMode?: 'plan' | 'auto';
      maxTurns?: number;
    };
    content: string; // system prompt
    path: string;
    iconPath?: string;
    source?: 'user' | 'project';
  }>;
  /**
   * Resolved MCP server configs for enabled+consented mcp-backed extensions.
   * Secrets are pre-decrypted main-side. The subprocess spawns/connects a
   * client per entry and exposes their tools as `mcp__<slug>__<tool>`.
   */
  mcpServers?: PiMcpServerConfig[];
  /** App-level compaction tuning (see AiSettings.compactionSettings). Resolved
   *  into absolute reserveTokens/keepRecentTokens against the active model's
   *  contextWindow inside pi-server, not here. */
  compactionSettings?: CompactionTuning;
}

export interface MsgPrompt {
  type: 'prompt';
  /** Caller-side correlation id (matches a renderer-side message id). */
  turnId: string;
  message: string;
  images?: PiPromptImage[];
  /** Per-turn system-prompt append for dynamic context injection. Pi subprocess updates resourceLoader when this changes. */
  systemPromptAppend?: string;
  /**
   * W3C trace-context carrier (`traceparent` + optional `tracestate`) of the
   * caller's active span. Present only for sub-agent subprocesses so their
   * `invoke_agent` span nests under the parent's `execute_tool Agent` span.
   * See docs/OTEL.md.
   */
  traceCarrier?: Record<string, string>;
}

export interface MsgAbort {
  type: 'abort';
  /** Optional turn id; if omitted, abort whatever's running. */
  turnId?: string;
  reason?: string;
}

export interface MsgTokenUpdate {
  type: 'token_update';
  credential: PiCredential;
}

export interface MsgPreToolUseResponse {
  type: 'pre_tool_use_response';
  requestId: string;
  action: 'allow' | 'block' | 'modify';
  /** Replacement input when action === 'modify'. */
  input?: unknown;
  /** Reason shown to the model when action === 'block'. */
  reason?: string;
}

/** Collaboration engagement response from main → subprocess. */
export interface MsgCollaborationResponse {
  type: 'collaboration_response';
  requestId: string;
  response: unknown; // EngagementResponse from collaboration-types
}

export interface MsgSetModel {
  type: 'set_model';
  model: string;
  /** See MsgInit.visionSupported. */
  visionSupported?: boolean;
}

export interface MsgSetThinkingLevel {
  type: 'set_thinking_level';
  level: PiThinkingLevel;
}

export interface MsgSetPermissionMode {
  type: 'set_permission_mode';
  mode: PiPermissionMode;
}

export interface MsgMiniCompletion {
  type: 'mini_completion';
  requestId: string;
  /** Plain prompt text — bypasses the agent loop, no tools. */
  systemPrompt: string;
  userPrompt: string;
  /** Override of the mini model picked at init. */
  model?: string;
  maxTokens?: number;
}

export interface MsgLlmQuery {
  type: 'llm_query';
  requestId: string;
  /** Opaque from main's POV — passed verbatim to the in-subprocess handler. */
  request: unknown;
}

export interface MsgSteer {
  type: 'steer';
  /** Turn id we're injecting into. */
  turnId: string;
  message: string;
  images?: PiPromptImage[];
}

export interface MsgManualCompact {
  type: 'manual_compact';
  /** Synthetic turn id — routes events back through the per-turn EventQueue. */
  turnId: string;
  customInstructions?: string;
}

export interface MsgShutdown {
  type: 'shutdown';
}

export type SubprocessInbound =
  | MsgInit
  | MsgPrompt
  | MsgAbort
  | MsgTokenUpdate
  | MsgPreToolUseResponse
  | MsgCollaborationResponse
  | MsgManualCompact
  | MsgSetModel
  | MsgSetThinkingLevel
  | MsgSetPermissionMode
  | MsgMiniCompletion
  | MsgLlmQuery
  | MsgSteer
  | MsgPlanApprovalResponse
  | MsgAuthRefreshResult
  | MsgShutdown;

/* ============================================================ */
/*  Outbound messages (subprocess → main)                        */
/* ============================================================ */

export interface MsgReady {
  type: 'ready';
  /** Pi-assigned session id (used for resume on next run). */
  piSessionId: string | null;
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
  piSessionId: string;
}

export interface MsgAuthRefreshRequest {
  type: 'auth_refresh_request';
  requestId: string;
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

export interface MsgPlanApprovalResponse {
  type: 'planning:approval-response';
  sessionId: string;
  phaseId: string;
  approved: boolean;
  notes?: string;
}

export type SubprocessOutbound =
  | MsgReady
  | MsgEvent
  | MsgPreToolUseRequest
  | MsgCollaborationRequest
  | MsgAuthRefreshRequest
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
