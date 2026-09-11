// GenAI `chat` span helpers shared by the agent-loop model spans
// (index.ts's forwardEvent) and the standalone completeSimple paths
// (mini_completion / llm_query).
import {
  captureContent,
  safeAttr,
  setAttrs,
  SpanKind,
  SpanStatusCode,
  withSpan,
  type Span,
} from '../../shared/otel';
import { state } from './state';

export interface NormalizedUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

/** pi-ai normalizes every provider's usage to this shape (types.d.ts:Usage). */
export function readUsage(usage: unknown): NormalizedUsage {
  if (!usage || typeof usage !== 'object') return {};
  const u = usage as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  return {
    input: num(u.input),
    output: num(u.output),
    cacheRead: num(u.cacheRead),
    cacheWrite: num(u.cacheWrite),
    totalTokens: num(u.totalTokens),
  };
}

/** Map pi-ai StopReason → a GenAI finish_reasons value. */
export function finishReason(stop?: string): string | undefined {
  if (!stop) return undefined;
  switch (stop) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'toolUse': return 'tool_calls';
    case 'error': return 'error';
    case 'aborted': return 'aborted';
    default: return stop;
  }
}

/** Hostname of the active model endpoint, for `server.address`. */
export function serverAddress(): string | undefined {
  const base = (state.model as { baseUrl?: string } | undefined)?.baseUrl;
  if (!base) return undefined;
  try { return new URL(base).hostname; } catch { return undefined; }
}

export interface AssistantMsg {
  usage?: unknown;
  model?: string;
  responseModel?: string;
  responseId?: string;
  provider?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: unknown;
}

/**
 * Map a finished provider response (usage, response ids, finish reason, status)
 * onto a `chat` span. Shared by the agent-loop model span and the standalone
 * `completeSimple` paths (mini_completion / llm_query). Does NOT end the span or
 * touch turn-level state — callers own those.
 */
export function applyChatResultAttrs(span: Span, m?: AssistantMsg): void {
  const usage = readUsage(m?.usage);
  const reason = finishReason(m?.stopReason);
  // gen_ai.usage.input_tokens is the TOTAL prompt size (OpenAI-style: cached
  // tokens are a subset of the prompt, not separate from it). pi-ai reports the
  // uncached delta in `input`, so the true prompt = input + cacheRead +
  // cacheWrite. Cost/usage dashboards sum input_tokens, so reporting only the
  // uncached delta (often ~2 with prompt caching) would wildly undercount. The
  // cache split stays available in the dedicated cache_* attributes.
  const totalInput =
    usage.input === undefined &&
    usage.cacheRead === undefined &&
    usage.cacheWrite === undefined
      ? undefined
      : (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  setAttrs(span, {
    'gen_ai.response.model': m?.responseModel ?? m?.model,
    'gen_ai.response.id': m?.responseId,
    'gen_ai.response.finish_reasons': reason ? [reason] : undefined,
    'gen_ai.usage.input_tokens': totalInput,
    'gen_ai.usage.output_tokens': usage.output,
    'gen_ai.usage.cache_read_input_tokens': usage.cacheRead,
    'gen_ai.usage.cache_creation_input_tokens': usage.cacheWrite,
    'server.address': serverAddress(),
  });
  if (captureContent() && m?.content) {
    span.setAttribute('gen_ai.output.messages', safeAttr(m.content));
  }
  if (m?.stopReason === 'error' || m?.stopReason === 'aborted') {
    span.setAttribute('error.type', m?.stopReason === 'aborted' ? 'aborted' : 'model_error');
    span.setStatus({ code: SpanStatusCode.ERROR, message: m?.errorMessage ?? 'model error' });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

export function finishModelSpan(m?: AssistantMsg): void {
  const span = state.modelSpan;
  if (!span) return;
  state.modelSpan = undefined;
  applyChatResultAttrs(span, m);
  // Track the latest assistant text so the turn span can carry the final
  // response when content capture is on (the last non-empty wins).
  if (m?.content) {
    const text = pickTextFromMessage(m);
    if (text) state.turnAssistantText = text;
  }
  span.end();
}

/**
 * Wrap a standalone `completeSimple` call (mini_completion / llm_query) in a
 * GenAI `chat` span so its token usage is counted like an agent-loop model call.
 * Without this these LLM calls would consume tokens invisibly to cost/usage
 * dashboards. Runs as a root span (these paths have no turn span); errors set
 * the span status via withSpan and propagate to the handler's catch.
 */
export async function tracedCompletion<T extends AssistantMsg>(
  opts: {
    model: string;
    callKind: 'mini_completion' | 'llm_query';
    maxTokens?: number;
    inputMessages?: unknown;
    systemInstructions?: string;
  },
  run: () => Promise<T>,
): Promise<T> {
  return withSpan(
    `chat ${opts.model}`,
    async (span) => {
      setAttrs(span, {
        'gen_ai.operation.name': 'chat',
        'gen_ai.provider.name': state.init?.auth.provider,
        'gen_ai.request.model': opts.model,
        'gen_ai.request.max_tokens': opts.maxTokens,
        'gen_ai.conversation.id': state.init?.sessionId,
        'server.address': serverAddress(),
        'minimalist_agent.call_kind': opts.callKind,
      });
      if (captureContent()) {
        if (opts.inputMessages !== undefined)
          span.setAttribute('gen_ai.input.messages', safeAttr(opts.inputMessages));
        if (opts.systemInstructions)
          span.setAttribute('gen_ai.system_instructions', safeAttr(opts.systemInstructions));
      }
      const result = await run();
      applyChatResultAttrs(span, result);
      return result;
    },
    { kind: SpanKind.CLIENT },
  );
}

export function pickTextFromMessage(message: unknown): string {
  const m = message as {
    content?: Array<{ type?: string; text?: string; content?: unknown }>;
    text?: string;
  };
  if (!m) return '';
  // Top-level text field (some providers flatten to a single string).
  if (typeof m.text === 'string' && m.text.length > 0) return m.text;
  if (!m.content) return '';
  // Pull text from any block that exposes a string `text` field — covers
  // 'text' blocks, 'output_text' blocks, and providers that don't tag the
  // type at all but include a `.text` property.
  const out = m.content
    .filter((b) => b && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (out.length > 0) return out;
  // Last-ditch: some providers wrap text in a nested `content` array.
  for (const b of m.content) {
    if (b && Array.isArray((b as { content?: unknown }).content)) {
      const inner = pickTextFromMessage(b);
      if (inner) return inner;
    }
  }
  return '';
}
