// Pi event → AgentChatEvent adapter.
//
// Lives in the subprocess so main never has to import Pi types.:
//   - Coalesce streaming text deltas; suppress duplicate text_complete
//   - Track tool name by toolCallId for end-event correlation
//   - Normalize tool arg field names to match Claude Code's UI conventions
//     (so Read/Write/Edit/etc. render with the same chip labels)

import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { AgentChatEvent, SubagentProgressUpdate } from '../agent/events';
import { parseError } from '../agent/errors';

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
 * Normalize Pi tool arg shapes to the field names the Claude Code UI
 * already expects. This keeps the renderer ignorant of the backend.
 *
 *   Pi `path`              ↔ Claude Code `file_path`   (Read/Write/Edit)
 *   Pi `edits[].oldText`   ↔ Claude Code `old_string`  (Edit, single entry)
 *   Pi `edits[].newText`   ↔ Claude Code `new_string`  (Edit, single entry)
 *
 * Multi-entry `edits[]` arrays are left as-is; DiffPart.tsx handles them
 * natively via the array branch in parseDiffInput.
 */
const FIELD_RENAME: Record<string, Record<string, string>> = {
  read: { path: 'file_path' },
  write: { path: 'file_path' },
  edit: { path: 'file_path' },
};

function normalizeArgs(toolName: string, args: unknown): unknown {
  if (!args || typeof args !== 'object') return args;
  const rename = FIELD_RENAME[toolName.toLowerCase()];
  // Apply top-level field renames (path → file_path).
  const out: Record<string, unknown> = rename
    ? (() => {
        const o = { ...(args as Record<string, unknown>) };
        for (const [from, to] of Object.entries(rename)) {
          if (from in o && !(to in o)) {
            o[to] = o[from];
            delete o[from];
          }
        }
        return o;
      })()
    : { ...(args as Record<string, unknown>) };

  // Pi edit: edits[] with a single entry → flatten to old_string / new_string
  // so callers that only know the Claude Code flat format still work.
  // Multi-entry arrays are kept; DiffPart handles them with its own branch.
  if (
    toolName.toLowerCase() === 'edit' &&
    Array.isArray(out.edits) &&
    out.edits.length === 1
  ) {
    const e = out.edits[0] as { oldText?: unknown; newText?: unknown };
    if (typeof e.oldText === 'string' && typeof e.newText === 'string') {
      out.old_string = e.oldText;
      out.new_string = e.newText;
      // Keep edits[] as well — DiffPart prefers the array branch, but
      // tool-summary fallbacks may inspect the flat fields.
    }
  }

  return out;
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

function parseSubagentUpdate(update: unknown): SubagentProgressUpdate | null {
  if (!update || typeof update !== 'object') return null;
  const u = update as Partial<SubagentProgressUpdate> & { kind?: unknown };
  if (u.kind !== 'subagent') return null;
  if (typeof u.execId !== 'string' || typeof u.agentSlug !== 'string') return null;
  return {
    kind: 'subagent',
    execId: u.execId,
    agentSlug: u.agentSlug,
    agentName: typeof u.agentName === 'string' ? u.agentName : undefined,
    phase: u.phase,
    detail: typeof u.detail === 'string' ? u.detail : undefined,
    event: u.event,
    at: typeof u.at === 'number' ? u.at : undefined,
  };
}

function pickAssistantText(message: unknown): string {
  // AgentMessage.content is an array of content blocks; collect text blocks.
  const m = message as {
    role?: string;
    content?: Array<{ type?: string; text?: string }> | string;
  };
  if (!m?.content) return '';
  if (typeof m.content === 'string') return m.content;
  return m.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('');
}

function isAssistantMessage(message: unknown): boolean {
  return (message as { role?: string } | null)?.role === 'assistant';
}

/**
 * Looser check used in the snapshot-diff fallback: accept anything that
 * *isn't* clearly a user message. Some Pi providers omit `role` on the
 * partial assistant message during early streaming; refusing those would
 * leave us with an empty bubble.
 */
function looksLikeAssistantSnapshot(message: unknown): boolean {
  const m = message as { role?: string } | null;
  if (!m) return false;
  return m.role !== 'user' && m.role !== 'tool';
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  if (typeof result === 'object') {
    // Pi tool results often expose `output` or `text`. Fall back to JSON.
    const r = result as { output?: unknown; text?: unknown };
    if (typeof r.output === 'string') return r.output;
    if (typeof r.text === 'string') return r.text;
    try { return JSON.stringify(result); } catch { /* */ }
  }
  return String(result);
}

/** Set PI_DEBUG=1 in the environment to dump every Pi event to stderr.
 *  Useful when adapter output is empty and we need to see what Pi actually sent. */
const PI_DEBUG = process.env.PI_DEBUG === '1';

function debug(event: AgentSessionEvent): void {
  if (!PI_DEBUG) return;
  try {
    const t = (event as { type?: string }).type;
    const sub = (event as { assistantMessageEvent?: { type?: string } })
      .assistantMessageEvent;
    const msg = (event as {
      message?: {
        role?: string;
        content?: unknown;
        stopReason?: string;
        errorMessage?: string;
        api?: string;
        provider?: string;
        model?: string;
        usage?: unknown;
      };
    }).message;
    const role = msg?.role;
    const contentPreview =
      typeof msg?.content === 'string'
        ? msg.content.slice(0, 120)
        : Array.isArray(msg?.content)
          ? `[${msg.content.length} blocks: ${msg.content
              .map((b: unknown) => (b as { type?: string }).type ?? '?')
              .join(',')}]`
          : '';
    const extras: string[] = [];
    if (msg?.stopReason) extras.push(`stop=${msg.stopReason}`);
    if (msg?.errorMessage) extras.push(`err=${JSON.stringify(msg.errorMessage)}`);
    if (msg?.api) extras.push(`api=${msg.api}`);
    if (msg?.provider) extras.push(`provider=${msg.provider}`);
    if (msg?.model) extras.push(`model=${msg.model}`);
    process.stderr.write(
      `[pi-event] ${t}` +
        (sub ? ` sub=${sub.type}` : '') +
        (role ? ` role=${role}` : '') +
        (contentPreview ? ` content=${contentPreview}` : '') +
        (extras.length ? ' ' + extras.join(' ') : '') +
        '\n',
    );
    // For terminal events, also dump the full message payload — that's
    // where Copilot-specific failure details usually hide.
    if (t === 'message_end' || t === 'agent_end' || t === 'turn_end') {
      try {
        process.stderr.write(
          `[pi-event-detail] ${JSON.stringify(event).slice(0, 10000)}\n`,
        );
      } catch { /* */ }
    }
  } catch {
    /* never crash on debug */
  }
}

export function adaptPiEvent(event: AgentSessionEvent): AgentChatEvent[] {
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
      const sub = (event as { assistantMessageEvent?: { type?: string } })
        .assistantMessageEvent;
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
      const msg = (event as {
        message: { stopReason?: string; errorMessage?: string } | unknown;
      }).message;
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
      const u = (msg as {
        usage?: {
          input?: number;
          output?: number;
          cacheRead?: number;
          cacheWrite?: number;
        };
      }).usage;
      if (u && (u.input || u.output || u.cacheRead || u.cacheWrite)) {
        out.push({
          type: 'assistant_usage',
          usage: {
            inputTokens: u.input ?? 0,
            outputTokens: u.output ?? 0,
            cacheReadInputTokens: u.cacheRead ?? 0,
            cacheCreationInputTokens: u.cacheWrite ?? 0,
          },
        });
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
      } catch { /* skip */ }
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
      // Use 'end_turn' (the Anthropic convention for a normal stop) so the
      // renderer's showStopBadge check (!== 'end_turn') doesn't render an
      // amber badge on every successfully completed Pi turn.
      out.push({ type: 'turn_done', stopReason: 'end_turn' });
      return out;
    }

    // Compaction: emitted on _end_ (matching the Claude SDK path) so the
    // renderer shows the CompactionNotice toast and the CompactionDivider.
    // _start_ shows a transient "compacting..." status line instead of the
    // event itself. Aborted (user-cancelled) compactions produce no boundary.
    case 'compaction_start': {
      const e = event as { reason: 'manual' | 'threshold' | 'overflow' };
      const text =
        e.reason === 'overflow'
          ? '\n_…recovering from context overflow…_\n'
          : e.reason === 'manual'
            ? '\n_…compacting (manual)…_\n'
            : '\n_…compacting older messages…_\n';
      out.push({ type: 'text_delta', text });
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
      if (e.aborted) return out;
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
      out.push({
        type: 'text_delta',
        text: '\n_…retrying summarization after a transient error…_\n',
      });
      return out;

    default:
      // Unknown / queue_update / session_info_changed / etc. — drop.
      return out;
  }
}
