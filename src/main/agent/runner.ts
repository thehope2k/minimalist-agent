// Public agent entry point. Dispatches to a provider-specific backend
// based on the resolved auth shape.
//
//   anthropic_api_key / anthropic_oauth → backends/anthropic.ts
//   copilot_oauth / local_api           → backends/pi/agent.ts

import type { StoredAttachment } from '../storage/sessions';
import { sessionPath } from '../storage/sessions';
import type { AgentChatEvent } from './events';
import type { PermissionMode } from './permissions';
import type { PiAuthProvider } from '../../shared/pi-types';
import type { PiThinkingLevel } from './backends/pi/protocol';
import { runAnthropicChat, type AnthropicAuth } from './backends/anthropic';
import { runPiChat } from './backends/pi/agent';
import type { ResolvedAuth } from './backends/types';
import type { CollaborationAsk } from '../../shared/collaboration-types';

export type { AgentChatEvent };
export type { AnthropicAuth };
export type { ResolvedAuth };
export type { CollaborationAsk };

export interface AgentChatRequest {
  /**
   * Resolved, fresh auth produced by `auth/resolve.ts`. The shape's
   * discriminator picks the backend.
   */
  auth: ResolvedAuth;
  /** Pi sub-provider — required when auth is copilot_oauth or local_api. */
  piAuthProvider?: PiAuthProvider;
  /**
   * Connection slug — needed by the Pi backend so it can mutex token
   * refresh against the same connection across concurrent turns.
   */
  connectionSlug?: string;
  /** Caller-side correlation id (renderer message id). */
  turnId: string;
  /** Owning chat session id — required for Pi (anchors Pi's session log). */
  chatSessionId?: string;
  model: string;
  prompt: string;
  attachments?: StoredAttachment[];
  cwd?: string;
  resumeSessionId?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  /** Effective thinking level for this turn (Pi backend only; ignored by Anthropic backend). */
  thinkingLevel?: PiThinkingLevel;
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
  if (req.auth.type === 'copilot_oauth' || req.auth.type === 'local_api') {
    if (!req.chatSessionId) {
      throw new Error(
        'runAgentChat: chatSessionId is required for Pi/local connections.',
      );
    }
    if (!req.connectionSlug) {
      throw new Error(
        'runAgentChat: connectionSlug is required for Pi/local connections.',
      );
    }
    return runPiChat({
      connectionSlug: req.connectionSlug,
      auth: req.auth,
      piAuthProvider: req.auth.type === 'copilot_oauth'
        ? (req.piAuthProvider ?? 'github-copilot')
        : undefined,
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
  return runAnthropicChat({
    auth: req.auth,
    turnId: req.turnId,
    chatSessionId: req.chatSessionId,
    model: req.model,
    prompt: req.prompt,
    attachments: req.attachments,
    cwd: req.cwd,
    resumeSessionId: req.resumeSessionId,
    maxTurns: req.maxTurns,
    permissionMode: req.permissionMode,
    askCollaboration: req.askCollaboration,
    autonomyLevel: req.autonomyLevel,
    pinnedAssets: req.pinnedAssets,
    signal: req.signal,
  });
}
