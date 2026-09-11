// Public entry point for agent chat turns.

import type { StoredAttachment } from '../storage/sessions';
import { sessionPath } from '../storage/sessions';
import type { AgentChatEvent } from './events';
import type { PermissionMode } from './permissions';
import type { ThinkingLevel } from './pi/protocol';
import { runChat } from './pi/agent';
import type { ResolvedAuth } from './auth';
import type { CollaborationAsk } from '../../shared/collaboration-types';

export type { AgentChatEvent };
export type { ResolvedAuth };
export type { CollaborationAsk };

export interface AgentChatRequest {
  /**
   * Resolved, fresh auth produced by `auth/resolve.ts`.
   */
  auth: ResolvedAuth;
  /**
   * Connection slug — used to mutex token refresh against the same
   * connection across concurrent turns.
   */
  connectionSlug?: string;
  /** Caller-side correlation id (renderer message id). */
  turnId: string;
  /** Owning chat session id — anchors the runtime session log. */
  chatSessionId?: string;
  model: string;
  prompt: string;
  attachments?: StoredAttachment[];
  cwd?: string;
  resumeSessionId?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  /** Effective thinking level for this turn. */
  thinkingLevel?: ThinkingLevel;
  /** Collaboration callback for intelligent engagement tools. */
  askCollaboration?: CollaborationAsk;
  /** User's autonomy level (0-100) for intelligent collaboration. */
  autonomyLevel?: number;
  /** Scoped pinned asset slugs for this session ('user:<slug>' | 'project:<slug>'). */
  pinnedAssets?: string[];
  signal?: AbortSignal;
}

/** Run one chat turn. Yields events ending with `turn_done` or `error`. */
export function runAgentChat(
  req: AgentChatRequest,
): AsyncGenerator<AgentChatEvent> {
  if (!req.chatSessionId) {
    throw new Error('runAgentChat: chatSessionId is required.');
  }
  if (!req.connectionSlug) {
    throw new Error('runAgentChat: connectionSlug is required.');
  }
  return runChat({
    connectionSlug: req.connectionSlug,
    auth: req.auth,
    turnId: req.turnId,
    chatSessionId: req.chatSessionId,
    chatSessionPath: sessionPath(req.chatSessionId),
    model: req.model,
    prompt: req.prompt,
    attachments: req.attachments,
    cwd: req.cwd,
    permissionMode: req.permissionMode,
    thinkingLevel: req.thinkingLevel,
    askCollaboration: req.askCollaboration,
    autonomyLevel: req.autonomyLevel,
    pinnedAssets: req.pinnedAssets,
    signal: req.signal,
  });
}
