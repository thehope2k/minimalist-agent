// Pi event → AgentChatEvent adapter.
//
// Lives in the subprocess so main never has to import Pi types.:
//   - Coalesce streaming text deltas; suppress duplicate text_complete
//   - Track tool name by toolCallId for end-event correlation
//   - Normalize tool argument shapes for the renderer's tool components

import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { AgentChatEvent } from '../agent-runtime/events';
import { parseError } from '../agent-runtime/errors';

import { debug } from './event-adapter/debug';
import {
  isAssistantMessage,
  looksLikeAssistantSnapshot,
  parseSubagentUpdate,
  pickAssistantText,
  stringifyToolResult,
} from './event-adapter/message-helpers';
import { normalizeArgs } from './event-adapter/tool-arguments';
import {
  hasAnyUsage,
  sumRunUsage,
  toAgentUsage,
  type NormalizedUsage,
} from './event-adapter/usage';

interface AdapterState {
  /** Text accumulated for the current message; flushed on message_end. */
  pendingText: string;
  /** Whether we already emitted a streaming delta for the current message. */
  emittedAnyDelta: boolean;
  /** Tool name resolved at start, used to enrich tool_result. */
  toolNameByCallId: Map<string, string>;
}

const state: AdapterState = {
  pendingText: '',
  emittedAnyDelta: false,
  toolNameByCallId: new Map(),
};

function reset(): void {
  state.pendingText = '';
  state.emittedAnyDelta = false;
  // Don't clear toolNameByCallId — tool_execution_end may arrive after the
  // turn boundary in some Pi event orderings.
}

/**
 * Extract the streaming text delta from a Pi message_update event.
 * Pi sends the full updated AssistantMessage each time; we diff against
 * what we've already streamed.
 */
function extractDelta(fullText: string): string {
  if (fullText.startsWith(state.pendingText)) {
    return fullText.slice(state.pendingText.length);
  }
  // Out-of-band edit (rare) — emit the entire content as a fresh delta.
  return fullText;
}

export function adaptAgentEvent(event: AgentSessionEvent): AgentChatEvent[] {
  debug(event);
  const out: AgentChatEvent[] = [];
  const t = (event as { type: string }).type;

  switch (t) {
    case 'agent_start':
      reset();
      return out;

    case 'message_start': {
      const msg = (event as { message: unknown }).message;
      if (isAssistantMessage(msg)) reset();
      return out;
    }

    case 'message_update': {
      // Pi's `message_update` event carries an `assistantMessageEvent`
      // which is the canonical streaming-text channel. Each `text_delta`
      // sub-event has a precise `delta` string — no diff math needed.
      // Non-assistant messages (e.g. the user message Pi appends to
      // history) don't carry this field, so they're naturally ignored.
      const sub = (event as { assistantMessageEvent?: { type?: string } }).assistantMessageEvent;
      const msg = (event as { message: unknown }).message;
      if (!sub || !sub.type) {
        // No streaming sub-event — fall back to diffing the message
        // snapshot. Some Pi providers (notably Copilot) don't surface
        // `assistantMessageEvent` on every update.
        //
        // We accept either:
        //   - explicit role='assistant' (canonical), OR
        //   - a missing role plus content that *looks like* an assistant
        //     content array (`[{type:'text', text:'...'}]`). User
        //     messages are filtered earlier in `forwardEvent` because
        //     they fire before the assistant message_start; this guard
        //     just keeps us honest.
        if (!looksLikeAssistantSnapshot(msg)) return out;
        const fullText = pickAssistantText(msg);
        const delta = extractDelta(fullText);
        if (delta) {
          out.push({ type: 'text_delta', text: delta });
          state.pendingText = fullText;
          state.emittedAnyDelta = true;
        }
        return out;
      }

      switch (sub.type) {
        case 'text_delta': {
          const e = sub as { delta?: string };
          if (e.delta) {
            out.push({ type: 'text_delta', text: e.delta });
            state.pendingText += e.delta;
            state.emittedAnyDelta = true;
          }
          return out;
        }
        case 'thinking_delta': {
          const e = sub as { delta?: string };
          if (e.delta) {
            out.push({ type: 'thinking_delta', text: e.delta });
          }
          return out;
        }
        // text_start / thinking_start / text_end / thinking_end /
        // tool_call_* — accumulator events; nothing to forward yet.
        default:
          return out;
      }
    }

    case 'message_end': {
      const msg = (
        event as {
          message: { stopReason?: string; errorMessage?: string } | unknown;
        }
      ).message;
      if (!isAssistantMessage(msg)) return out;
      // Surface API failures — Pi sets stopReason='error' + errorMessage on
      // provider rejections (e.g. Copilot's "vision is not enabled"). Without
      // this branch the empty content slips through and the user sees a blank
      // bubble. Auth-flavoured errors are intercepted upstream in
      // pi-server/index.ts before the adapter runs.
      const m = msg as { stopReason?: string; errorMessage?: string };
      if (m.stopReason === 'error' && m.errorMessage) {
        // Strip "Anthropic" brand prefix from pi-ai's internal error strings.
        // Copilot Claude models use the Anthropic API wire format, so pi-ai's
        // anthropic.js provider is used under the hood. Its error messages
        // start with "Anthropic ..." but the connection is Copilot — replace
        // the prefix so the raw diagnostics string isn't misleading.
        const sanitized = m.errorMessage.replace(/^Anthropic\s+/i, 'API ');
        out.push({ type: 'error', error: parseError(new Error(sanitized)) });
        reset();
        return out;
      }
      // pi-ai reports token usage as input/output/cacheRead/cacheWrite;
      // AgentUsage names them *InputTokens. Map across so the renderer can
      // size the context. A turn has one message_end per assistant round;
      // the latest round's usage is the true current context footprint
      // (cacheRead grows as history accumulates), so the renderer overwrites
      // on each `assistant_usage`.
      const u = (msg as { usage?: NormalizedUsage }).usage;
      if (u) {
        const usage = toAgentUsage(u);
        if (hasAnyUsage(usage)) out.push({ type: 'assistant_usage', usage });
      }
      const finalText = pickAssistantText(msg);
      if (!state.emittedAnyDelta && finalText) {
        out.push({ type: 'text_complete', text: finalText });
      }
      reset();
      return out;
    }

    case 'tool_execution_start': {
      const e = event as {
        toolCallId: string;
        toolName: string;
        args: unknown;
      };
      state.toolNameByCallId.set(e.toolCallId, e.toolName);
      out.push({
        type: 'tool_start',
        toolUseId: e.toolCallId,
        name: e.toolName,
        input: normalizeArgs(e.toolName, e.args),
      });
      return out;
    }

    case 'tool_execution_update': {
      const e = event as { toolCallId: string; partialResult: unknown };
      const sub = parseSubagentUpdate(e.partialResult);
      if (sub) {
        out.push({
          type: 'tool_progress',
          toolUseId: e.toolCallId,
          update: sub,
        });
        return out;
      }
      // Best-effort: Pi's partial result is freeform; surface as a tool
      // input delta only if it serializes to something compact.
      try {
        const json = JSON.stringify(e.partialResult);
        if (json && json.length < 4096) {
          out.push({
            type: 'tool_input_delta',
            toolUseId: e.toolCallId,
            partialJson: json,
          });
        }
      } catch {
        /* skip */
      }
      return out;
    }

    case 'tool_execution_end': {
      const e = event as {
        toolCallId: string;
        toolName: string;
        result: unknown;
        isError: boolean;
      };
      out.push({
        type: 'tool_result',
        toolUseId: e.toolCallId,
        content: stringifyToolResult(e.result),
        isError: e.isError,
      });
      state.toolNameByCallId.delete(e.toolCallId);
      return out;
    }

    case 'turn_end': {
      // No-op in our protocol — agent_end carries the final stop info.
      return out;
    }

    case 'agent_end': {
      // Normalize successful completion to the stop reason expected by the
      // renderer so it does not show an amber badge for ordinary Pi turns.
      //
      // The Session Usage panel requires a turn-level `usage` aggregate, not
      // just the per-round `assistant_usage` emitted from message_end.
      const runMessages =
        (event as { messages?: { role?: string; usage?: NormalizedUsage }[] }).messages ?? [];
      out.push({ type: 'turn_done', stopReason: 'end_turn', usage: sumRunUsage(runMessages) });
      return out;
    }

    // compaction_start fires mid-turn for threshold/overflow triggers, so a
    // text_delta here would glue onto the assistant's in-progress message.
    case 'compaction_start': {
      const e = event as { reason: 'manual' | 'threshold' | 'overflow' };
      out.push({ type: 'compaction_progress', phase: 'started', trigger: e.reason });
      return out;
    }

    case 'compaction_end': {
      const e = event as {
        reason: 'manual' | 'threshold' | 'overflow';
        result?: {
          tokensBefore?: number;
          estimatedTokensAfter?: number;
          summary?: string;
          details?: { readFiles?: string[]; modifiedFiles?: string[] };
        };
        aborted: boolean;
        errorMessage?: string;
      };
      // An aborted compaction must still emit a completion event: it's the
      // only signal the renderer's "Compacting…" toast has to clear itself.
      if (e.aborted) {
        out.push({
          type: 'compaction',
          status: 'failed',
          trigger: e.reason,
          errorMessage: e.errorMessage ?? 'Compaction was aborted before it finished.',
        });
        return out;
      }
      if (e.result) {
        out.push({
          type: 'compaction',
          status: 'success',
          trigger: e.reason,
          preTokens: e.result.tokensBefore ?? 0,
          postTokens: e.result.estimatedTokensAfter,
          summary: e.result.summary,
          readFiles: e.result.details?.readFiles,
          modifiedFiles: e.result.details?.modifiedFiles,
        });
      } else {
        out.push({
          type: 'compaction',
          status: 'failed',
          trigger: e.reason,
          errorMessage: e.errorMessage ?? 'Compaction failed for an unknown reason.',
        });
      }
      return out;
    }

    case 'auto_retry_start':
      out.push({
        type: 'text_delta',
        text: '\n_…retrying after a transient error…_\n',
      });
      return out;

    case 'summarization_retry_scheduled':
      out.push({ type: 'compaction_progress', phase: 'retrying' });
      return out;

    default:
      // Unknown / queue_update / session_info_changed / etc. — drop.
      return out;
  }
}
