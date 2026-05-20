// JSONL wire format between main process (PiAgent) and the Pi subprocess.
//
// One discriminated union per direction; each message is encoded as a
// single line of JSON on stdin/stdout.
//
// IMPORTANT: this file is imported by both the main process and the Pi
// subprocess entrypoint. It must remain dependency-free (no Electron,
// no Pi SDK imports — only types).

import type { AgentChatEvent } from '../../events';

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
export type PiPermissionMode = 'plan' | 'ask' | 'auto';

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
  /** Pre-rendered system prompt (preferences + project context + skills). */
  systemPrompt: string;
  /** Resume an existing Pi session if one is stored. */
  resumePiSessionId?: string;
  /** Base URL for custom/local endpoints (e.g. http://localhost:11434). */
  baseUrl?: string;
  /** Custom endpoint protocol — required when baseUrl is set. */
  customEndpoint?: { api: 'openai-completions' | 'anthropic-messages'; supportsImages?: boolean };
}

export interface MsgPrompt {
  type: 'prompt';
  /** Caller-side correlation id (matches a renderer-side message id). */
  turnId: string;
  message: string;
  images?: PiPromptImage[];
  /** Per-turn system-prompt append (SDD coaching block + phase context).
   *  Pi subprocess updates resourceLoader when this changes. */
  systemPromptAppend?: string;
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

export interface MsgSetModel {
  type: 'set_model';
  model: string;
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
  | MsgSetModel
  | MsgSetThinkingLevel
  | MsgSetPermissionMode
  | MsgMiniCompletion
  | MsgLlmQuery
  | MsgSteer
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

/**
 * Subprocess-detected auth failure — main refreshes the token and pushes
 * `token_update`. The user prompt itself is NOT auto-retried (Pi has
 * already errored the turn); we surface a typed error so the UI can
 * offer a one-click retry.
 */
export interface MsgAuthRequired {
  type: 'auth_required';
  turnId?: string;
  message: string;
}

export interface MsgFatalError {
  type: 'error';
  message: string;
}

export type SubprocessOutbound =
  | MsgReady
  | MsgEvent
  | MsgPreToolUseRequest
  | MsgMiniCompletionResult
  | MsgLlmQueryResult
  | MsgSessionIdUpdate
  | MsgAuthRequired
  | MsgFatalError;

/* ============================================================ */
/*  Helpers                                                      */
/* ============================================================ */

/** Read-only tool names that the permission gate can auto-allow even in
 *  `plan` mode. The same set the Anthropic backend treats as safe. */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'read',
  'grep',
  'find',
  'ls',
  'glob',
  'web_fetch',
  'web_search',
]);
