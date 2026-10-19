import type { ChatMessage } from '@/lib/chat';
import type { ContextBreakdown } from '@/lib/electron';

export interface TurnUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  total: number;
  /** True when derived from a compaction's postTokens estimate rather than
   *  a real API usage report — the input/output/cache split isn't real. */
  estimated: boolean;
}

/**
 * Size of what the next request will carry, as of the last completed round.
 * Same formula as pi's `calculateContextTokens()` (input + output + cache
 * read + cache write), so the badge previews pi's own compaction decision.
 */
export function lastTurnUsage(messages: ChatMessage[]): TurnUsage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    if (m.markerKind === 'compaction') {
      const post = m.compactionMeta?.status === 'success' ? m.compactionMeta.postTokens : undefined;
      if (post == null) continue;
      return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, total: post, estimated: true };
    }
    const u = m.latestCallUsage ?? m.usage;
    if (!u) continue;
    const input = u.inputTokens ?? 0;
    const output = u.outputTokens ?? 0;
    const cacheRead = u.cacheReadInputTokens ?? 0;
    const cacheCreate = u.cacheCreationInputTokens ?? 0;
    const total = input + output + cacheRead + cacheCreate;
    if (total > 0) {
      return { input, output, cacheRead, cacheCreate, total, estimated: false };
    }
  }
  return null;
}

export function latestBreakdown(messages: ChatMessage[]): ContextBreakdown | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const b = messages[i].contextBreakdown;
    if (b) return b;
  }
  return null;
}

export function countCompactions(messages: ChatMessage[]): number {
  return messages.filter(
    (m) =>
      m.role === 'assistant' &&
      m.markerKind === 'compaction' &&
      m.compactionMeta?.status !== 'failed',
  ).length;
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

export type SegmentKey =
  'conversation' | 'builtin' | 'mcp' | 'system' | 'project' | 'reserve' | 'free';

export interface Segment {
  key: SegmentKey;
  label: string;
  tokens: number;
  /** Split from the chars/4 estimate rather than measured. */
  estimated: boolean;
}

/**
 * Split the context window into segments. Only the used total is real;
 * fixed categories are estimates, and conversation is the remainder, so
 * the segments always add up to the measured total. Zero-size segments
 * are dropped.
 */
export function buildSegments(args: {
  used: number;
  contextWindow: number;
  reserveTokens: number;
  breakdown: ContextBreakdown | null;
}): Segment[] {
  const { used, contextWindow, reserveTokens, breakdown } = args;
  const fixed: Segment[] = breakdown
    ? [
        {
          key: 'builtin',
          label: 'Built-in tools',
          tokens: breakdown.builtinTools.tokens,
          estimated: true,
        },
        {
          key: 'mcp',
          label: 'MCP tools',
          tokens: breakdown.mcpServers.reduce((sum, s) => sum + s.tokens, 0),
          estimated: true,
        },
        { key: 'system', label: 'System prompt', tokens: breakdown.systemPrompt, estimated: true },
        {
          key: 'project',
          label: 'Project instructions',
          tokens: breakdown.projectInstructions,
          estimated: true,
        },
      ]
    : [];
  const fixedTotal = fixed.reduce((sum, s) => sum + s.tokens, 0);
  const conversation: Segment = {
    key: 'conversation',
    label: breakdown ? 'Conversation' : 'Used',
    tokens: Math.max(0, used - fixedTotal),
    estimated: !!breakdown,
  };
  const remaining = Math.max(0, contextWindow - used);
  const reserve = Math.min(reserveTokens, remaining);
  const segments: Segment[] = [
    conversation,
    ...fixed,
    { key: 'reserve', label: 'Compaction reserve', tokens: reserve, estimated: false },
    { key: 'free', label: 'Free', tokens: remaining - reserve, estimated: false },
  ];
  return segments.filter((s) => s.tokens > 0);
}
