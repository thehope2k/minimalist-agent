// Main-process chat runtime.
//
// Owns the per-chat-session subprocess that runs `@earendil-works/pi-coding-agent`.
// Bridges JSONL events to the AgentChatEvent stream and handles OAuth refresh
// and mini-completion RPCs with main.
//
// Lifecycle:
//   1. First chat turn lazy-spawns `out/main/pi-server.js` under node
//   2. Sends `init` with credential + system prompt + initial mode
//   3. Awaits `ready`
//   4. Sends `prompt`; forwards `event` messages until `turn_done`/`error`
//   5. On window close / app quit / abort: sends `shutdown` then SIGKILL fallback
//
// Execution modes:
//   - Plan mode: Read-only tools (Read, Grep, Find, Ls) allowed, others blocked
//   - Auto mode: All tools allowed; agent uses collaboration tools for intelligent
//     engagement (RequestDecision, RequestPreference, RequestApproval, etc.)
//
// Token refresh:
//   When the subprocess detects an auth failure (typed `auth_required`),
//   we call `auth/resolve.ts` (which already mutexes), push the fresh
//   credential via `token_update`, and emit a typed expired_oauth_token
//   error so the UI offers a one-click retry.

import type { StoredAttachment } from '../../storage/sessions';
import type { PermissionMode } from '../permissions';
import type { ResolvedAuth } from '../auth';
import type { CollaborationAsk } from '../../../shared/collaboration-types';
import { send } from './subprocess-handle';
import { handles } from './chat-subprocess';
export { shutdownAllChatSubprocesses } from './chat-subprocess';

import type { ThinkingLevel } from './protocol';

/* ============================================================ */
/*  Public types                                                 */
/* ============================================================ */

export interface ChatRequest {
  /** Connection slug — needed by the resolver for mid-session token refresh. */
  connectionSlug: string;
  auth: ResolvedAuth;
  /** Renderer-side message id. */
  turnId: string;
  /** Our chat session id. */
  chatSessionId: string;
  /** Absolute path of the chat session's storage dir. */
  chatSessionPath: string;
  model: string;
  prompt: string;
  attachments?: StoredAttachment[];
  cwd?: string;
  thinkingLevel?: ThinkingLevel;
  permissionMode?: PermissionMode;
  /** Collaboration callback for intelligent engagement tools. */
  askCollaboration?: CollaborationAsk;
  /** User's autonomy level (0-100) for intelligent collaboration. */
  autonomyLevel?: number;
  /** Scoped pinned asset slugs for this session ('user:<slug>' | 'project:<slug>'). */
  pinnedAssets?: string[];
  signal?: AbortSignal;
}

export interface MiniCompletionRequest {
  connectionSlug: string;
  auth: ResolvedAuth;
  chatSessionId: string;
  chatSessionPath: string;
  cwd?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

/* ============================================================ */
/*  Subprocess handle (shared type + `send`)                      */
/* ============================================================ */

export { runChat, runManualCompact } from './chat-turns';
export { runMiniCompletion } from './mini-completion';

/* ============================================================ */
/*  Public API: steer (inject mid-turn user message)             */
/* ============================================================ */

/**
 * Inject a user message into an in-flight Pi turn. Returns true if a
 * subprocess was found for the chat session; false otherwise (e.g. the
 * turn already completed).
 */
export function steerTurn(args: {
  chatSessionPath: string;
  turnId: string;
  message: string;
}): boolean {
  const handle = handles.get(args.chatSessionPath);
  if (!handle || !handle.queues.has(args.turnId)) return false;
  send(handle, {
    type: 'steer',
    turnId: args.turnId,
    message: args.message,
  });
  return true;
}

/**
 * Send approval response for a phase to the subprocess.
 * Returns true if the subprocess was found and message sent.
 */
export function sendPlanApprovalResponse(args: {
  chatSessionPath: string;
  phaseId: string;
  approved: boolean;
  notes?: string;
}): boolean {
  const handle = handles.get(args.chatSessionPath);
  if (!handle) return false;

  send(handle, {
    type: 'planning:approval-response',
    sessionId: handle.chatSessionId,
    phaseId: args.phaseId,
    approved: args.approved,
    notes: args.notes,
  });

  return true;
}
