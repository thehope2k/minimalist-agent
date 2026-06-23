import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';

type Props = {
  messages: ChatMessage[];
  contextWindow: number;
  className?: string;
};

/**
 * Compact "context used" chip — shows the last assistant turn's full
 * input-token footprint (uncached delta + cache reads + cache creations)
 * vs the model's context window. Color shifts at 80% / 95%.
 *
 * Why the sum: Anthropic's API splits input tokens into three buckets
 * once prompt caching kicks in. `input_tokens` alone is just the new
 * delta — typically 15-50 tokens — and would understate context use as
 * the conversation grows. Summing all three gives the true position
 * within the context window.
 */
export function ContextBadge({ messages, contextWindow, className }: Props) {
  const usage = lastTurnUsage(messages);
  if (!usage || contextWindow <= 0) return null;

  const used = usage.total;
  const pct = Math.min(100, Math.round((used / contextWindow) * 100));

  // The agent auto-compacts older history once context passes
  // contextWindow − reserveTokens. Mirrors the Pi SDK default
  // (DEFAULT_COMPACTION_SETTINGS.reserveTokens) — keep in sync if it changes.
  const COMPACTION_RESERVE_TOKENS = 16384;
  const compactAt = Math.max(0, contextWindow - COMPACTION_RESERVE_TOKENS);
  const compactPct = Math.round((compactAt / contextWindow) * 100);
  const willCompactSoon = used >= compactAt;

  const tone =
    pct >= 95
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : pct >= 80
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-border bg-elevated/40 text-fg-subtle';

  // Tooltip surfaces the cache split so the user can see why "input
  // tokens" looks small even on big contexts, plus where auto-compaction
  // kicks in (a common "why don't I ever see compaction?" question).
  const tooltip = [
    `Total: ${used.toLocaleString()} / ${contextWindow.toLocaleString()} input tokens`,
    `· new: ${usage.input.toLocaleString()}`,
    `· cache read: ${usage.cacheRead.toLocaleString()}`,
    `· cache create: ${usage.cacheCreate.toLocaleString()}`,
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
        {compact(used)} / {compact(contextWindow)}
      </span>
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
    // Prefer per-call usage from the latest API round (real prompt size
    // at that moment). Fall back to the aggregate `usage` only when
    // per-call data isn't available — older sessions that streamed
    // before this event existed, or backends that don't emit it.
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

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}
