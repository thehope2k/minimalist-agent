import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';
import { Tooltip } from '../ui';

type Props = {
  messages: ChatMessage[];
  contextWindow: number;
  /** Tokens reserved below the context window before compaction triggers. */
  reserveTokens: number;
  className?: string;
};

/**
 * Compact "context used" chip — shows the model's CURRENT total context
 * occupancy (input + output + cache_read + cache_create of the most recent
 * completed round) vs its context window.
 *
 * This deliberately mirrors the pi SDK's own compaction trigger
 * (`calculateContextTokens` in @earendil-works/pi-coding-agent) token for
 * token: input+output+cacheRead+cacheWrite from the last round is exactly
 * what the SDK compares against `contextWindow - reserveTokens` to decide
 * whether to auto-compact. Showing the same number here means the badge's
 * percentage and "auto-compacts near ~X%" line are a reliable preview of
 * the SDK's own decision, not a separate approximation — including staying
 * in sync when compaction actually shrinks the last-round usage.
 *
 * cache_read tokens ARE counted (unlike an earlier version of this badge):
 * they are still real tokens the model had to hold in context for this
 * request, they just weren't billed as fresh input. The instantaneous
 * "how much was new this round" pressure signal lives in the tooltip
 * instead of the headline number.
 */
export function ContextBadge({ messages, contextWindow, reserveTokens, className }: Props) {
  const usage = lastTurnUsage(messages);
  if (!usage || contextWindow <= 0) return null;

  // Same formula as the SDK's calculateContextTokens(): the full size of
  // what the next request will carry, as of the last completed round.
  const contextTokens = usage.total;
  const live = usage.input + usage.cacheCreate;
  const pct = Math.min(100, Math.round((contextTokens / contextWindow) * 100));

  const compactAt = Math.max(0, contextWindow - reserveTokens);
  const compactPct = Math.round((compactAt / contextWindow) * 100);
  const willCompactSoon = contextTokens >= compactAt;

  const compactionCount = countCompactions(messages);

  const tone =
    pct >= 95
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : pct >= 80
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-border bg-elevated/40 text-fg-subtle';

  const tooltipContent = (
    <div className="space-y-1.5 font-mono text-[11px]">
      <div className="space-y-0.5">
        <div className="font-semibold">
          Context: {contextTokens.toLocaleString()} / {contextWindow.toLocaleString()} tokens
        </div>
        <div className="pl-2 text-fg-muted">
          <div>↳ input: {usage.input.toLocaleString()}</div>
          <div>↳ output: {usage.output.toLocaleString()}</div>
          <div>↳ cache read: {usage.cacheRead.toLocaleString()}</div>
          <div>↳ cache write: {usage.cacheCreate.toLocaleString()}</div>
        </div>
      </div>
      <div className="text-fg-muted whitespace-nowrap">
        New this round: {live.toLocaleString()}{' '}
        <span className="opacity-70">(not served from cache)</span>
      </div>
      <div className="border-t border-border pt-1.5">
        {compactionCount > 0 ? (
          <div className="text-fg-muted">Compacted {compactionCount}× — older history summarised</div>
        ) : (
          <div className="text-fg-subtle">Not yet compacted</div>
        )}
      </div>
      <div className="text-fg-subtle text-[10px] whitespace-nowrap">
        {willCompactSoon
          ? '⚠ Auto-compaction imminent — older history compresses next turn.'
          : `Auto-compacts near the limit (~${compactPct}%, ${compactAt.toLocaleString()} tokens).`}
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent} side="top" className="max-w-none">
      <span
        className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px]',
        tone,
        className,
      )}
    >
      <span>{pct}%</span>
      <span className="opacity-60">·</span>
      <span>
        {compact(contextTokens)} / {compact(contextWindow)}
      </span>
      {compactionCount > 0 && (
        <>
          <span className="opacity-40">·</span>
          <span className="opacity-70">{compactionCount}×</span>
        </>
      )}
      </span>
    </Tooltip>
  );
}

interface TurnUsage {
  input: number;
  output: number;
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
    const output = u.outputTokens ?? 0;
    const cacheRead = u.cacheReadInputTokens ?? 0;
    const cacheCreate = u.cacheCreationInputTokens ?? 0;
    const total = input + output + cacheRead + cacheCreate;
    if (total > 0) {
      return { input, output, cacheRead, cacheCreate, total };
    }
  }
  return null;
}

function countCompactions(messages: ChatMessage[]): number {
  return messages.filter(
    (m) =>
      m.role === 'assistant' &&
      m.markerKind === 'compaction' &&
      m.compactionMeta?.status !== 'failed',
  ).length;
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}
