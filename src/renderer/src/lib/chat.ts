import type {
  AgentError,
  ChatRole,
  StoredAttachment,
  StoredMessage,
  StoredMessagePart,
  AgentUsage,
} from './electron';

export type { AgentError };

/**
 * One rendered segment of a chat message. Assistant turns interleave these
 * in the order the SDK produced them; user messages are always a single
 * `text` part.
 */
export interface SubagentTranscript {
  execId: string;
  agentSlug: string;
  agentName?: string;
  phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error';
  detail?: string;
  startedAt: number;
  updatedAt: number;
  parts: MessagePart[];
  isStreaming: boolean;
  stopReason?: string;
  usage?: AgentUsage;
  latestCallUsage?: AgentUsage;
  error?: string;
  errorInfo?: AgentError;
}

export type MessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string; collapsed?: boolean }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      /** Final, parsed input — set once we have it. */
      input?: unknown;
      /** Accumulated while input streams as deltas. */
      partialInputJson?: string;
      result?: { content: string; isError?: boolean };
      status: 'running' | 'done' | 'error';
      /** Full nested transcript when this tool spawns a sub-agent. */
      subagent?: SubagentTranscript;
    };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  parts: MessagePart[];
  /** Set on the assistant message while it's still streaming. */
  isStreaming?: boolean;
  /** Recorded for display under the bubble. */
  model?: string;
  /** Set on the assistant message if the stream errored. Legacy plain text. */
  error?: string;
  /** Rich, typed error info for the new error rendering. */
  errorInfo?: AgentError;
  /** SDK stop_reason — we surface anything other than `end_turn` in the UI. */
  stopReason?: string;
  /** Aggregate token counts from the SDK's `result` — used for cost / display. */
  usage?: AgentUsage;
  /** Total wall-clock duration of the turn in milliseconds. Persisted. */
  durationMs?: number;
  /**
   * Per-call usage from the latest API round inside the turn. Anthropic
   * attaches `usage` to every assistant message it returns; we keep the
   * most recent so the context badge can report the real prompt size on
   * the *current* call (vs the aggregate sum which exceeds the window
   * for tool-heavy turns). Live-only — not persisted.
   */
  latestCallUsage?: AgentUsage;
  /** Origin tag — drives a contextual chip above user bubbles. */
  intentTag?: string;
  /** User-message attachments (images / PDFs / text files). */
  attachments?: StoredAttachment[];
  /**
   * Marker rows live alongside real turns in the message list. Today only
   * 'compaction' (a between-turns boundary chip).
   */
  markerKind?: 'compaction';
  compactionMeta?: {
    trigger: 'manual' | 'auto';
    preTokens: number;
    postTokens?: number;
    durationMs?: number;
  };
  /**
   * Original creation timestamp from StoredMessage — preserved so that the
   * zombie-correction path can write it back without bumping meta.lastMessageAt
   * to Date.now() and causing the session to jump in the sorted list.
   */
  createdAt?: number;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* -------- conversions ------------------------------------------- */

/**
 * Hydrate a stored message into a renderable one. v1.0 sessions only have
 * `content: string` — we wrap that as a single text part.
 */
export function chatFromStored(stored: StoredMessage): ChatMessage {
  const parts = stored.parts?.length
    ? stored.parts.map(storedPartToPart)
    : stored.content
      ? [{ kind: 'text' as const, text: stored.content }]
      : [];
  return {
    id: stored.id,
    role: stored.role,
    parts,
    model: stored.model,
    error: stored.error,
    errorInfo: stored.errorInfo,
    stopReason: stored.stopReason,
    usage: stored.usage,
    durationMs: stored.durationMs,
    intentTag: stored.intentTag,
    attachments: stored.attachments,
    markerKind: stored.markerKind,
    compactionMeta: stored.compactionMeta,
    createdAt: stored.createdAt,
  };
}

function storedPartToPart(p: StoredMessagePart): MessagePart {
  return p as MessagePart;
}

/** Flatten parts back into a single string (used to keep `content` populated). */
export function partsToContent(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.text)
    .join('');
}

/** Persist-ready snapshot of a chat message. */
export function chatToStored(msg: ChatMessage): StoredMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: partsToContent(msg.parts),
    parts: msg.parts.length
      ? msg.parts.map((p) => p as StoredMessagePart)
      : undefined,
    model: msg.model,
    error: msg.error,
    errorInfo: msg.errorInfo,
    stopReason: msg.stopReason,
    usage: msg.latestCallUsage ?? msg.usage,
    durationMs: msg.durationMs,
    intentTag: msg.intentTag,
    attachments: msg.attachments,
    markerKind: msg.markerKind,
    compactionMeta: msg.compactionMeta,
    createdAt: msg.createdAt ?? Date.now(),
  };
}
