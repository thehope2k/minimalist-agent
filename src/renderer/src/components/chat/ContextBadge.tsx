import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';

type Props = {
  messages: ChatMessage[];
  contextWindow: number;
  className?: string;
};

/**
 * Compact "context used" chip — shows the LIVE portion of context
 * (input_tokens + cache_creation_input_tokens) vs the model's context window.
 *
 * Why NOT cache_read: cache_read tokens are served from server-side prompt
 * cache and don't exert real pressure on the context limit. Showing
 * (input + cache_create) / window gives an honest "how close to trouble?"
 * signal rather than an inflated total that includes already-compacted history.
 *
 * The full breakdown (live + cached + total + compaction count) is in the
 * hover tooltip.
 */
export function ContextBadge({ messages, contextWindow, className }: Props) {
  const usage = lastTurnUsage(messages);
  if (!usage || contextWindow <= 0) return null;

  // Live = tokens the model actually had to process fresh this turn.
  // This is the meaningful pressure metric — not the cached portion.
  // Fall back to total when live is zero (e.g. backend doesn't report cache
  // breakdown) so the badge always shows something useful.
  const live = usage.input + usage.cacheCreate;
  const displayed = live > 0 ? live : usage.total;
  const pct = Math.min(100, Math.round((displayed / contextWindow) * 100));

  const COMPACTION_RESERVE_TOKENS = 16384;
  const compactAt = Math.max(0, contextWindow - COMPACTION_RESERVE_TOKENS);
  const compactPct = Math.round((compactAt / contextWindow) * 100);
  const willCompactSoon = displayed >= compactAt;

  const compactionCount = countCompactions(messages);

  const tone =
    pct >= 95
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : pct >= 80
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-border bg-elevated/40 text-fg-subtle';

  const tooltip = [
    live > 0
      ? `Live:   ${live.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`
      : `Total:  ${usage.total.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`,
    `· new tokens:      ${usage.input.toLocaleString()}`,
    `· cache writes:    ${usage.cacheCreate.toLocaleString()}`,
    `Cached: ${usage.cacheRead.toLocaleString()} (served from prompt cache)`,
    live > 0 ? `Total:  ${usage.total.toLocaleString()}` : '',
    '',
    compactionCount > 0
      ? `Compacted: ${compactionCount}× — older history summarised`
      : 'Not yet compacted',
    '',
    willCompactSoon
      ? 'Auto-compaction imminent — older history compresses next turn.'
      : `Auto-compacts near the limit (~${compactPct}%, ${compactAt.toLocaleString()} tokens).`,
  ].join('\n');

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px]',
        tone,
        className,
      )}
    >
      <span>{pct}%</span>
      <span className="opacity-60">·</span>
      <span>
        {compact(displayed)} / {compact(contextWindow)}
      </span>
      {compactionCount > 0 && (
        <>
          <span className="opacity-40">·</span>
          <span className="opacity-70">{compactionCount}×</span>
        </>
      )}
    </span>
  );
}

interface TurnUsage {
  input: number;
  cacheRead: number;
  cacheCreate: number;
  total: number;
}

function lastTurnUsage(messages: ChatMessage[]): TurnUsage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    const u = m.latestCallUsage ?? m.usage;
    if (!u) continue;
    const input = u.inputTokens ?? 0;
    const cacheRead = u.cacheReadInputTokens ?? 0;
    const cacheCreate = u.cacheCreationInputTokens ?? 0;
    const total = input + cacheRead + cacheCreate;
    if (total > 0) {
      return { input, cacheRead, cacheCreate, total };
    }
  }
  return null;
}

function countCompactions(messages: ChatMessage[]): number {
  return messages.filter(
    (m) => m.role === 'assistant' && m.markerKind === 'compaction',
  ).length;
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}
