import type { CompactionTuning } from '../../../../shared/compaction';
import type { MsgAuthRefreshResult } from './outbound';
import type {
  McpServerConfig,
  PermissionMode,
  RuntimeAuth,
  RuntimeCredential,
  ThinkingLevel,
} from './shared';

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
  thinkingLevel: ThinkingLevel;
  /** Initial credential — refreshed mid-flight via `token_update`. */
  auth: RuntimeAuth;
  /** Initial permission mode. */
  permissionMode: PermissionMode;
  /** Session autonomy level (0-100) for intelligent collaboration. */
  autonomyLevel?: number;
  /** Pre-rendered system prompt (preferences + project context + skills). */
  systemPrompt: string;
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
  mcpServers?: McpServerConfig[];
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
  credential: RuntimeCredential;
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
  level: ThinkingLevel;
}

export interface MsgSetPermissionMode {
  type: 'set_permission_mode';
  mode: PermissionMode;
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

/** Result of a `browser_tool` command, routed back from main → subprocess. */
export interface MsgBrowserToolResult {
  type: 'browser_tool_result';
  requestId: string;
  output: string;
  /** Base64-encoded screenshot, present only for `screenshot` commands. */
  imageBase64?: string;
  imageMimeType?: 'image/png' | 'image/jpeg';
  isError?: boolean;
}

export interface MsgPlanApprovalResponse {
  type: 'planning:approval-response';
  sessionId: string;
  phaseId: string;
  approved: boolean;
  notes?: string;
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
  | MsgBrowserToolResult
  | MsgShutdown;
