import type {
  AgentError,
  ChatRole,
  CompactionMeta,
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
  contextCheckpointIndex?: number;
  pendingRoundOutputTokens?: number;
  error?: string;
  errorInfo?: AgentError;
}

export type MessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string; collapsed?: boolean; outputTokens?: number }
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
      contextDelta?: number;
      contextDeltaGroupSize?: number;
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
   * for tool-heavy turns). Persisted as its own field so it survives
   * session reload — see `usage` for the round-trip counterpart.
   */
  latestCallUsage?: AgentUsage;
  /**
   * A mid-turn compaction shrinks context out from under a still-streaming
   * message, so the next `assistant_usage` can't be diffed against a
   * pre-compaction baseline — the drop isn't the next tool call's doing.
   * Set to skip exactly one comparison; never persisted.
   */
  contextResetPending?: boolean;
  /**
   * `parts` index where the last context-delta diff left off. Advances on
   * every `assistant_usage` — stamped or skipped — so a round whose usage
   * never fires still gets folded into the next successful diff instead of
   * being dropped. Never persisted.
   */
  contextCheckpointIndex?: number;
  /**
   * A round's own `output_tokens` (thinking + text + tool-call JSON it
   * generated), captured the instant `assistant_usage` fires — unlike
   * `contextDelta`, no diffing is needed, but it can't be stamped onto a
   * part yet because that part hasn't been produced. Held here until the
   * round's first narration part appears, then cleared. Never persisted.
   */
  pendingRoundOutputTokens?: number;
  /** Origin tag — drives a contextual chip above user bubbles. */
  intentTag?: string;
  /** User-message attachments (images / PDFs / text files). */
  attachments?: StoredAttachment[];
  /**
   * Marker rows live alongside real turns in the message list. Today only
   * 'compaction' (a between-turns boundary chip).
   */
  markerKind?: 'compaction';
  compactionMeta?: CompactionMeta;
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

function usageTotal(u: AgentUsage | undefined): number {
  if (!u) return 0;
  return (
    (u.inputTokens ?? 0) +
    (u.outputTokens ?? 0) +
    (u.cacheReadInputTokens ?? 0) +
    (u.cacheCreationInputTokens ?? 0)
  );
}

function usagePromptSize(u: AgentUsage): number {
  return (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0);
}

/**
 * Attributes the exact token delta since the last checkpoint to the tool
 * call(s) appended in that gap: `promptSize(newUsage) - total(prevUsage)`
 * is the real, provider-reported cost — not an estimate.
 *
 * The group boundary is an explicit checkpoint index, not "contiguous tool
 * parts at the end of the array": narration commonly sits between rounds,
 * and not every round's `assistant_usage` fires, so inferring the boundary
 * from contiguity drops a round's cost the moment a `text`/`thinking` part
 * follows it. Diffing from an explicit `sinceIndex` instead means any gap
 * — one round or several — is still attributed in full, just as a larger
 * batch.
 *
 * Returns the original `parts` (but an advanced `checkpointIndex`) when
 * there's no prior round to diff against, or nothing since the last
 * checkpoint was a tool call.
 *
 * When more than one tool call closed out the gap, the whole delta is
 * attached to the last one with `contextDeltaGroupSize` set — the API
 * doesn't itemize per-block cost, so splitting it further would be
 * fabricated precision.
 */
export function attributeContextDelta(
  parts: MessagePart[],
  prevUsage: AgentUsage | undefined,
  newUsage: AgentUsage,
  sinceIndex: number,
): { parts: MessagePart[]; checkpointIndex: number } {
  const checkpointIndex = parts.length;

  if (!prevUsage) return { parts, checkpointIndex };

  const pendingToolIndices: number[] = [];
  for (let i = sinceIndex; i < parts.length; i++) {
    if (parts[i].kind === 'tool' && (parts[i] as Extract<MessagePart, { kind: 'tool' }>).contextDelta === undefined) {
      pendingToolIndices.push(i);
    }
  }
  if (pendingToolIndices.length === 0) return { parts, checkpointIndex };

  const delta = usagePromptSize(newUsage) - usageTotal(prevUsage);
  const lastIdx = pendingToolIndices[pendingToolIndices.length - 1];
  const groupSize = pendingToolIndices.length;
  const nextParts = [...parts];
  nextParts[lastIdx] = {
    ...(parts[lastIdx] as Extract<MessagePart, { kind: 'tool' }>),
    contextDelta: delta,
    contextDeltaGroupSize: groupSize > 1 ? groupSize : undefined,
  };
  return { parts: nextParts, checkpointIndex };
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
    latestCallUsage: stored.latestCallUsage,
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
    usage: msg.usage,
    latestCallUsage: msg.latestCallUsage,
    durationMs: msg.durationMs,
    intentTag: msg.intentTag,
    attachments: msg.attachments,
    markerKind: msg.markerKind,
    compactionMeta: msg.compactionMeta,
    createdAt: msg.createdAt ?? Date.now(),
  };
}
