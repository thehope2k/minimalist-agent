// Maps Claude Agent SDK messages to a flat, renderer-friendly event union.
//
// Stateless by design: the renderer's reducer (useChat) is the single
// source of truth for assembling tool parts, partial JSON, etc. We just
// classify raw SDK chunks into stable, narrow shapes.
//
// Things deliberately *not* tracked here:
//   - ToolIndex / parent-task tracking (no subagents yet)
//   - per-message usage snapshots (renderer just gets cumulative usage on
//     `turn_done` from the result message)
//   - retry-with-different-error special cases (we surface errors verbatim)

import type {
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKRateLimitInfo,
  SDKResultError,
} from '@anthropic-ai/claude-agent-sdk';
import { type AgentError, summarizeSdkResultError } from './errors';

export type { AgentError };

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type NestedAgentChatEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'text_complete'; text: string }
  | { type: 'thinking_delta'; text: string }
  | {
      type: 'tool_start';
      toolUseId: string;
      name: string;
      input?: unknown;
    }
  | { type: 'tool_input_delta'; toolUseId: string; partialJson: string }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      type: 'turn_done';
      sessionId?: string;
      stopReason?: string;
      usage?: AgentUsage;
    }
  | {
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | { type: 'error'; error: AgentError; sessionId?: string };

export interface SubagentProgressUpdate {
  kind: 'subagent';
  execId: string;
  agentSlug: string;
  agentName?: string;
  phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error';
  detail?: string;
  event?: NestedAgentChatEvent;
  at?: number;
}

export type AgentChatEvent =
  | { type: 'text_delta'; text: string }
  /** Emitted only when the SDK sent the assistant message without partial events. */
  | { type: 'text_complete'; text: string }
  | { type: 'thinking_delta'; text: string }
  | {
      type: 'tool_start';
      toolUseId: string;
      name: string;
      /** Present when the tool comes in via the full assistant message (already parsed). */
      input?: unknown;
    }
  | { type: 'tool_input_delta'; toolUseId: string; partialJson: string }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      type: 'tool_progress';
      toolUseId: string;
      update: SubagentProgressUpdate;
    }
  | {
      type: 'turn_done';
      sessionId?: string;
      stopReason?: string;
      usage?: AgentUsage;
    }
  | {
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | {
      /** SDK finished compacting older messages between turns. */
      type: 'compaction';
      status: 'success' | 'failed';
      trigger: 'manual' | 'auto' | 'threshold' | 'overflow';
      preTokens?: number;
      postTokens?: number;
      durationMs?: number;
      summary?: string;
      readFiles?: string[];
      modifiedFiles?: string[];
      errorMessage?: string;
    }
  | {
      type: 'compaction_progress';
      phase: 'started' | 'retrying';
      trigger?: 'manual' | 'threshold' | 'overflow';
    }
  | { type: 'error'; error: AgentError; sessionId?: string };

/* ---------- helpers --------------------------------------------- */

interface RawStreamEvent {
  type?: string;
  index?: number;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
}

/**
 * Pull out events from a single `stream_event` message. Most chunks produce
 * one event; some (e.g. `message_stop`) produce none and are caller-owned.
 */
function adaptStreamEvent(
  msg: SDKPartialAssistantMessage,
  blockToToolId: Map<number, string>,
): AgentChatEvent[] {
  const ev = msg.event as RawStreamEvent;
  const events: AgentChatEvent[] = [];

  switch (ev?.type) {
    case 'content_block_start': {
      if (
        ev.content_block?.type === 'tool_use' &&
        ev.content_block.id &&
        ev.content_block.name &&
        typeof ev.index === 'number'
      ) {
        blockToToolId.set(ev.index, ev.content_block.id);
        events.push({
          type: 'tool_start',
          toolUseId: ev.content_block.id,
          name: ev.content_block.name,
        });
      }
      break;
    }
    case 'content_block_delta': {
      if (ev.delta?.type === 'text_delta' && ev.delta.text) {
        events.push({ type: 'text_delta', text: ev.delta.text });
      } else if (ev.delta?.type === 'thinking_delta' && ev.delta.thinking) {
        events.push({ type: 'thinking_delta', text: ev.delta.thinking });
      } else if (
        ev.delta?.type === 'input_json_delta' &&
        typeof ev.delta.partial_json === 'string' &&
        typeof ev.index === 'number'
      ) {
        const toolUseId = blockToToolId.get(ev.index);
        if (toolUseId) {
          events.push({
            type: 'tool_input_delta',
            toolUseId,
            partialJson: ev.delta.partial_json,
          });
        }
      }
      break;
    }
    default:
      // message_start / message_delta / content_block_stop / message_stop —
      // we rely on the `result` message for stop_reason + usage instead.
      break;
  }
  return events;
}

interface AssistantBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  thinking?: string;
}

interface ToolResultBlock {
  type: string;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && 'text' in c && typeof (c as { text: unknown }).text === 'string') {
          return (c as { text: string }).text;
        }
        try {
          return JSON.stringify(c);
        } catch {
          return String(c);
        }
      })
      .join('\n');
  }
  if (content == null) return '';
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function pushNestedEvent(
  events: AgentChatEvent[],
  parentToolUseId: string,
  event: NestedAgentChatEvent,
): void {
  events.push({
    type: 'tool_progress',
    toolUseId: parentToolUseId,
    update: {
      kind: 'subagent',
      execId: parentToolUseId,
      agentSlug: 'subagent',
      phase: event.type === 'turn_done' ? 'finalizing' : event.type === 'error' ? 'error' : 'running',
      event,
      at: Date.now(),
    },
  });
}

/* ---------- main entry ------------------------------------------ */

export interface AdaptState {
  /** Set of tool_use_ids we've already emitted `tool_start` for. */
  emittedToolStarts: Set<string>;
  /** stream_event index → tool_use_id. Cleared between turns implicitly. */
  blockToToolId: Map<number, string>;
  /** Text accumulated from `assistant` messages when no partials were seen. */
  fallbackText: string;
  /** True once any text_delta has been emitted. */
  streamedText: boolean;
  /**
   * Hard rate-limit signal (`status: 'rejected'`) from a structured
   * `rate_limit_event`. The error path reads this to attach a precise reset
   * time and a credits-required classification rather than parsing thrown
   * error text. Absent unless the API rejects a request for rate limits.
   */
  rateLimitRejection?: { resetsAt?: number; creditsRequired: boolean };
}

export function newAdaptState(): AdaptState {
  return {
    emittedToolStarts: new Set(),
    blockToToolId: new Map(),
    fallbackText: '',
    streamedText: false,
  };
}

/**
 * Convert one SDK message into zero-or-more renderer events. Returns
 * `{ events, terminal }` where `terminal: true` means the caller should
 * stop reading from the SDK iterable.
 */
export function adaptSdkMessage(
  msg: SDKMessage,
  state: AdaptState,
): { events: AgentChatEvent[]; terminal: boolean } {
  const events: AgentChatEvent[] = [];

  switch (msg.type) {
    case 'stream_event': {
      const out = adaptStreamEvent(msg, state.blockToToolId);
      for (const e of out) {
        if (e.type === 'tool_start') state.emittedToolStarts.add(e.toolUseId);
        if (e.type === 'text_delta') state.streamedText = true;
        events.push(e);
      }
      return { events, terminal: false };
    }

    case 'assistant': {
      const parentToolUseId = (msg as { parent_tool_use_id?: string | null }).parent_tool_use_id ?? null;

      // Per-API-call usage. The Anthropic API attaches `usage` to every
      // assistant message it returns; the SDK forwards it verbatim. We
      // emit a dedicated event so the renderer can track the *latest*
      // call's prompt size — i.e. real context fullness — rather than
      // having to reason about the aggregate sum on `turn_done`.
      const rawUsage = (msg.message as { usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      } }).usage;
      const usageEvt: NestedAgentChatEvent = {
        type: 'assistant_usage',
        usage: {
          inputTokens: rawUsage?.input_tokens,
          outputTokens: rawUsage?.output_tokens,
          cacheReadInputTokens: rawUsage?.cache_read_input_tokens,
          cacheCreationInputTokens: rawUsage?.cache_creation_input_tokens,
        },
      };
      if (rawUsage) {
        if (parentToolUseId) pushNestedEvent(events, parentToolUseId, usageEvt);
        else events.push(usageEvt);
      }

      const blocks = (msg.message.content as AssistantBlock[]) ?? [];
      for (const b of blocks) {
        if (parentToolUseId) {
          if (b.type === 'text' && b.text) {
            pushNestedEvent(events, parentToolUseId, { type: 'text_delta', text: b.text });
          } else if (b.type === 'thinking' && b.thinking) {
            pushNestedEvent(events, parentToolUseId, { type: 'thinking_delta', text: b.thinking });
          } else if (b.type === 'tool_use' && b.id && b.name) {
            pushNestedEvent(events, parentToolUseId, {
              type: 'tool_start',
              toolUseId: b.id,
              name: b.name,
              input: b.input,
            });
            try {
              pushNestedEvent(events, parentToolUseId, {
                type: 'tool_input_delta',
                toolUseId: b.id,
                partialJson: JSON.stringify(b.input ?? {}),
              });
            } catch {
              /* skip */
            }
          }
          continue;
        }

        if (b.type === 'text' && b.text) {
          state.fallbackText += b.text;
        } else if (b.type === 'tool_use' && b.id && b.name) {
          if (!state.emittedToolStarts.has(b.id)) {
            state.emittedToolStarts.add(b.id);
            events.push({
              type: 'tool_start',
              toolUseId: b.id,
              name: b.name,
              input: b.input,
            });
          } else {
            // Already started via stream_event — emit one synthetic
            // input_delta carrying the parsed input so the renderer can
            // display the canonical form even if it never assembled
            // partial_json correctly.
            try {
              events.push({
                type: 'tool_input_delta',
                toolUseId: b.id,
                partialJson: JSON.stringify(b.input ?? {}),
              });
            } catch { /* skip */ }
          }
        } else if (b.type === 'thinking' && b.thinking) {
          // Some providers send thinking as a final block, not deltas.
          events.push({ type: 'thinking_delta', text: b.thinking });
        }
      }
      return { events, terminal: false };
    }

    case 'user': {
      const parentToolUseId = (msg as { parent_tool_use_id?: string | null }).parent_tool_use_id ?? null;
      // The SDK feeds tool results back in as a user message whose content
      // is an array of tool_result blocks.
      const content = (msg.message?.content as ToolResultBlock[] | string) ?? [];
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type === 'tool_result' && b.tool_use_id) {
            const resultEvt: NestedAgentChatEvent = {
              type: 'tool_result',
              toolUseId: b.tool_use_id,
              content: stringifyToolResult(b.content),
              isError: !!b.is_error,
            };
            if (parentToolUseId) pushNestedEvent(events, parentToolUseId, resultEvt);
            else events.push(resultEvt);
          }
        }
      }
      return { events, terminal: false };
    }

    case 'result': {
      const result = msg as {
        subtype: string;
        session_id?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
        stop_reason?: string;
      };

      if (result.subtype === 'success') {
        // No partials arrived — flush the assembled assistant text once.
        if (!state.streamedText && state.fallbackText) {
          events.push({ type: 'text_complete', text: state.fallbackText });
        }
        events.push({
          type: 'turn_done',
          sessionId: result.session_id,
          stopReason: result.stop_reason,
          usage: result.usage
            ? {
                inputTokens: result.usage.input_tokens,
                outputTokens: result.usage.output_tokens,
                cacheReadInputTokens: result.usage.cache_read_input_tokens,
                cacheCreationInputTokens: result.usage.cache_creation_input_tokens,
              }
            : undefined,
        });
      } else {
        // Error subtypes (max_turns, budget, etc.) still carry session_id —
        // forward it so the next turn can resume the conversation. Without
        // this, hitting `max_turns` and clicking Continue starts fresh.
        events.push({
          type: 'error',
          sessionId: result.session_id,
          error: summarizeSdkResultError(result as unknown as SDKResultError),
        });
      }
      return { events, terminal: true };
    }

    case 'tool_progress': {
      const p = msg as {
        tool_use_id?: string;
        tool_name?: string;
        parent_tool_use_id?: string | null;
        elapsed_time_seconds?: number;
      };
      if (p.parent_tool_use_id) {
        events.push({
          type: 'tool_progress',
          toolUseId: p.parent_tool_use_id,
          update: {
            kind: 'subagent',
            execId: p.parent_tool_use_id,
            agentSlug: 'subagent',
            phase: 'running',
            detail: p.tool_name
              ? `${p.tool_name}${typeof p.elapsed_time_seconds === 'number' ? ` · ${Math.floor(p.elapsed_time_seconds)}s` : ''}`
              : undefined,
            at: Date.now(),
          },
        });
      }
      return { events, terminal: false };
    }

    case 'system': {
      const sys = msg as {
        subtype?: string;
        compact_metadata?: {
          trigger?: 'manual' | 'auto';
          pre_tokens?: number;
          post_tokens?: number;
          duration_ms?: number;
        };
      };
      if (sys.subtype === 'compact_boundary' && sys.compact_metadata) {
        events.push({
          type: 'compaction',
          status: 'success',
          trigger: sys.compact_metadata.trigger ?? 'auto',
          preTokens: sys.compact_metadata.pre_tokens ?? 0,
          postTokens: sys.compact_metadata.post_tokens,
          durationMs: sys.compact_metadata.duration_ms,
        });
      }
      return { events, terminal: false };
    }

    case 'rate_limit_event': {
      // A rate_limit_event reports subscription rate-limit state on every
      // change (including warnings). Only hard rejections are retained, and
      // no renderer event is emitted here: the turn failure surfaces
      // separately as a thrown / result error, which this signal enriches.
      // Emitting an event here would double-report the same failure.
      const info = (msg as { rate_limit_info?: SDKRateLimitInfo }).rate_limit_info;
      if (info && (info.status === 'rejected' || info.overageStatus === 'rejected')) {
        state.rateLimitRejection = {
          resetsAt: info.resetsAt ?? info.overageResetsAt,
          creditsRequired: info.errorCode === 'credits_required',
        };
      }
      return { events, terminal: false };
    }

    default:
      return { events: [], terminal: false };
  }
}
