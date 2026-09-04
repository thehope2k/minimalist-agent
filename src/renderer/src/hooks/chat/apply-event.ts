// Pure reducers that turn one streaming event into the next message/parts
// state. No closures over hook state — safe to test/extract in isolation.
import { attributeContextDelta, type ChatMessage, type MessagePart } from '@/lib/chat';
import type { AgentError, ChatStreamEvent, NestedChatStreamEvent } from '@/lib/electron';

/* ---------- parts reducer --------------------------------------- */

export function applyNestedEvent(
  parts: MessagePart[],
  evt: NestedChatStreamEvent,
  prevUsage: ChatMessage['latestCallUsage'],
  checkpointIndex: number,
  pendingOutputTokens: number | undefined,
): {
  parts: MessagePart[];
  usage?: ChatMessage['usage'];
  latestCallUsage?: ChatMessage['latestCallUsage'];
  checkpointIndex?: number;
  /** 0 = explicitly cleared, undefined = unchanged, >0 = new pending value — see ChatMessage.pendingRoundOutputTokens. */
  pendingRoundOutputTokens?: number;
  stopReason?: string;
  error?: string;
  errorInfo?: AgentError;
  isStreaming?: boolean;
} {
  switch (evt.type) {
    case 'text_delta':
    case 'text_complete': {
      const last = parts[parts.length - 1];
      if (last && last.kind === 'text') {
        const updated: MessagePart = { kind: 'text', text: last.text + evt.text };
        return { parts: [...parts.slice(0, -1), updated] };
      }
      return { parts: [...parts, { kind: 'text', text: evt.text }] };
    }
    case 'thinking_delta': {
      const last = parts[parts.length - 1];
      if (last && last.kind === 'thinking') {
        const updated: MessagePart = {
          kind: 'thinking',
          text: last.text + evt.text,
          collapsed: last.collapsed,
          outputTokens: last.outputTokens,
        };
        return { parts: [...parts.slice(0, -1), updated] };
      }
      const part: MessagePart = { kind: 'thinking', text: evt.text, collapsed: true };
      if (pendingOutputTokens) {
        part.outputTokens = pendingOutputTokens;
        return { parts: [...parts, part], pendingRoundOutputTokens: 0 };
      }
      return { parts: [...parts, part] };
    }
    case 'tool_start': {
      const idx = parts.findIndex((p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId);
      const existing = idx >= 0 ? (parts[idx] as Extract<MessagePart, { kind: 'tool' }>) : null;
      const next: MessagePart = existing
        ? { ...existing, name: evt.name, input: evt.input ?? existing.input }
        : {
            kind: 'tool',
            toolUseId: evt.toolUseId,
            name: evt.name,
            input: evt.input,
            status: 'running',
          };
      return {
        parts: idx >= 0
          ? [...parts.slice(0, idx), next, ...parts.slice(idx + 1)]
          : [...parts, next],
      };
    }
    case 'tool_input_delta': {
      const idx = parts.findIndex((p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId);
      if (idx < 0) return { parts };
      const tool = parts[idx] as Extract<MessagePart, { kind: 'tool' }>;
      const next: MessagePart = {
        ...tool,
        partialInputJson: (tool.partialInputJson ?? '') + evt.partialJson,
      };
      if (!tool.input) {
        try {
          next.input = JSON.parse(next.partialInputJson ?? '');
        } catch {
          /* partial only */
        }
      }
      return { parts: [...parts.slice(0, idx), next, ...parts.slice(idx + 1)] };
    }
    case 'tool_result': {
      const idx = parts.findIndex((p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId);
      if (idx < 0) return { parts };
      const tool = parts[idx] as Extract<MessagePart, { kind: 'tool' }>;
      const next: MessagePart = {
        ...tool,
        result: { content: evt.content, isError: evt.isError },
        status: evt.isError ? 'error' : 'done',
      };
      return { parts: [...parts.slice(0, idx), next, ...parts.slice(idx + 1)] };
    }
    case 'assistant_usage': {
      const result = attributeContextDelta(parts, prevUsage, evt.usage, checkpointIndex);
      return {
        parts: result.parts,
        latestCallUsage: evt.usage,
        checkpointIndex: result.checkpointIndex,
        pendingRoundOutputTokens: evt.usage.outputTokens ?? 0,
      };
    }
    case 'turn_done':
      return {
        parts,
        usage: evt.usage,
        stopReason: evt.stopReason ?? 'stop',
        isStreaming: false,
      };
    case 'error':
      return {
        parts,
        error: evt.error.message,
        errorInfo: evt.error,
        isStreaming: false,
      };
    default:
      return { parts };
  }
}

/**
 * Apply one streaming event to a chat message's parts. Returns the next
 * message; structural-share when nothing changed so React can skip work.
 */
export function applyEvent(msg: ChatMessage, evt: ChatStreamEvent): ChatMessage {
  switch (evt.type) {
    case 'text_delta':
    case 'text_complete': {
      const last = msg.parts[msg.parts.length - 1];
      if (last && last.kind === 'text') {
        const updated: MessagePart = {
          kind: 'text',
          text: last.text + evt.text,
        };
        return { ...msg, parts: [...msg.parts.slice(0, -1), updated] };
      }
      return { ...msg, parts: [...msg.parts, { kind: 'text', text: evt.text }] };
    }
    case 'thinking_delta': {
      const last = msg.parts[msg.parts.length - 1];
      if (last && last.kind === 'thinking') {
        const updated: MessagePart = {
          kind: 'thinking',
          text: last.text + evt.text,
          collapsed: last.collapsed,
          outputTokens: last.outputTokens,
        };
        return { ...msg, parts: [...msg.parts.slice(0, -1), updated] };
      }
      const part: MessagePart = { kind: 'thinking', text: evt.text, collapsed: true };
      if (msg.pendingRoundOutputTokens) {
        part.outputTokens = msg.pendingRoundOutputTokens;
        return { ...msg, parts: [...msg.parts, part], pendingRoundOutputTokens: 0 };
      }
      return { ...msg, parts: [...msg.parts, part] };
    }
    case 'tool_start': {
      // De-dupe: if we've already pushed this toolUseId (e.g. via a previous
      // stream_event), update its input rather than appending a new card.
      const idx = msg.parts.findIndex(
        (p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId,
      );
      const existing = idx >= 0 ? (msg.parts[idx] as Extract<MessagePart, { kind: 'tool' }>) : null;
      const next: MessagePart = existing
        ? { ...existing, name: evt.name, input: evt.input ?? existing.input }
        : {
            kind: 'tool',
            toolUseId: evt.toolUseId,
            name: evt.name,
            input: evt.input,
            status: 'running',
          };
      const parts =
        idx >= 0
          ? [...msg.parts.slice(0, idx), next, ...msg.parts.slice(idx + 1)]
          : [...msg.parts, next];
      return { ...msg, parts };
    }
    case 'tool_input_delta': {
      const idx = msg.parts.findIndex(
        (p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId,
      );
      if (idx < 0) return msg;
      const tool = msg.parts[idx] as Extract<MessagePart, { kind: 'tool' }>;
      const next: MessagePart = {
        ...tool,
        partialInputJson: (tool.partialInputJson ?? '') + evt.partialJson,
      };
      // Try to upgrade to a parsed `input` once the JSON is well-formed.
      if (!tool.input) {
        try {
          next.input = JSON.parse(next.partialInputJson ?? '');
        } catch {
          /* still streaming — keep partial */
        }
      }
      return {
        ...msg,
        parts: [...msg.parts.slice(0, idx), next, ...msg.parts.slice(idx + 1)],
      };
    }
    case 'tool_result': {
      const idx = msg.parts.findIndex(
        (p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId,
      );
      if (idx < 0) return msg;
      const tool = msg.parts[idx] as Extract<MessagePart, { kind: 'tool' }>;
      const next: MessagePart = {
        ...tool,
        result: { content: evt.content, isError: evt.isError },
        status: evt.isError ? 'error' : 'done',
        subagent: tool.subagent
          ? {
              ...tool.subagent,
              phase: evt.isError ? 'error' : 'done',
              isStreaming: false,
              updatedAt: Date.now(),
            }
          : undefined,
      };
      return {
        ...msg,
        parts: [...msg.parts.slice(0, idx), next, ...msg.parts.slice(idx + 1)],
      };
    }
    case 'tool_progress': {
      if (evt.update.kind !== 'subagent') return msg;
      const idx = msg.parts.findIndex(
        (p) => p.kind === 'tool' && p.toolUseId === evt.toolUseId,
      );
      const tool = idx >= 0
        ? (msg.parts[idx] as Extract<MessagePart, { kind: 'tool' }>)
        : ({
            kind: 'tool',
            toolUseId: evt.toolUseId,
            name: 'Agent',
            status: 'running',
          } as Extract<MessagePart, { kind: 'tool' }>);
      const now = Date.now();
      const existing =
        tool.subagent && tool.subagent.execId === evt.update.execId
          ? tool.subagent
          : {
              execId: evt.update.execId,
              agentSlug: evt.update.agentSlug,
              agentName: evt.update.agentName,
              phase: 'spawning' as const,
              detail: undefined,
              startedAt: now,
              updatedAt: now,
              parts: [] as MessagePart[],
              isStreaming: true,
              stopReason: undefined,
              usage: undefined,
              latestCallUsage: undefined,
              contextCheckpointIndex: 0,
              pendingRoundOutputTokens: 0,
              error: undefined,
              errorInfo: undefined,
            };

      let nextSub = {
        ...existing,
        agentSlug: evt.update.agentSlug || existing.agentSlug,
        agentName: evt.update.agentName ?? existing.agentName,
        phase: evt.update.phase ?? existing.phase,
        detail: evt.update.detail ?? existing.detail,
        updatedAt: evt.update.at ?? now,
      };

      if (evt.update.event) {
        const nested = applyNestedEvent(
          nextSub.parts,
          evt.update.event,
          nextSub.latestCallUsage,
          nextSub.contextCheckpointIndex ?? 0,
          nextSub.pendingRoundOutputTokens,
        );
        nextSub = {
          ...nextSub,
          parts: nested.parts,
          usage: nested.usage ?? nextSub.usage,
          latestCallUsage: nested.latestCallUsage ?? nextSub.latestCallUsage,
          contextCheckpointIndex: nested.checkpointIndex ?? nextSub.contextCheckpointIndex,
          pendingRoundOutputTokens: nested.pendingRoundOutputTokens ?? nextSub.pendingRoundOutputTokens,
          stopReason: nested.stopReason ?? nextSub.stopReason,
          error: nested.error ?? nextSub.error,
          errorInfo: nested.errorInfo ?? nextSub.errorInfo,
          isStreaming: nested.isStreaming ?? nextSub.isStreaming,
        };
      }

      if (evt.update.phase === 'done' || evt.update.phase === 'error') {
        nextSub.isStreaming = false;
      }

      const next: MessagePart = {
        ...tool,
        subagent: nextSub,
      };

      const parts =
        idx >= 0
          ? [...msg.parts.slice(0, idx), next, ...msg.parts.slice(idx + 1)]
          : [...msg.parts, next];
      return {
        ...msg,
        parts,
      };
    }
    case 'turn_done': {
      return {
        ...msg,
        isStreaming: false,
        // Defensive fallback: pi-server's agent_end historically emitted turn_done
        // without a stopReason field. Guard here so a missing stopReason never
        // leaves the message in a zombie state that the interrupt detector fires on.
        stopReason: evt.stopReason ?? 'stop',
        usage: evt.usage,
        durationMs: msg.createdAt != null ? Date.now() - msg.createdAt : undefined,
      };
    }
    case 'assistant_usage': {
      // latestCallUsage backs the context badge's real prompt-size reading
      // (vs turn_done's aggregate, which can exceed the context window on
      // tool-heavy turns). contextResetPending forces a fresh baseline after
      // a mid-turn compaction invalidates the previous one.
      const prevUsage = msg.contextResetPending ? undefined : msg.latestCallUsage;
      const result = attributeContextDelta(
        msg.parts,
        prevUsage,
        evt.usage,
        msg.contextResetPending ? msg.parts.length : (msg.contextCheckpointIndex ?? 0),
      );
      return {
        ...msg,
        parts: result.parts,
        latestCallUsage: evt.usage,
        contextResetPending: false,
        contextCheckpointIndex: result.checkpointIndex,
        pendingRoundOutputTokens: evt.usage.outputTokens ?? 0,
      };
    }
    case 'error': {
      return {
        ...msg,
        isStreaming: false,
        errorInfo: evt.error,
        // Keep `error` populated for legacy renderers / external readers.
        error: evt.error.message,
        durationMs: msg.createdAt != null ? Date.now() - msg.createdAt : undefined,
      };
    }
    default:
      return msg;
  }
}
