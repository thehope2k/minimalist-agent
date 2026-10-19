import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';
import { ContextPopover } from './context-badge/ContextPopover';
import {
  buildSegments,
  compact,
  countCompactions,
  lastTurnUsage,
  latestBreakdown,
} from './context-badge/usage';

type Props = {
  messages: ChatMessage[];
  contextWindow: number;
  /** Tokens reserved below the context window before compaction triggers. */
  reserveTokens: number;
  className?: string;
};

/**
 * Compact "context used" chip — the model's current context occupancy vs its
 * window, matching pi's own compaction trigger token for token (see
 * `lastTurnUsage`). Click for what that context is spent on.
 */
export function ContextBadge({ messages, contextWindow, reserveTokens, className }: Props) {
  const usage = lastTurnUsage(messages);
  if (!usage || contextWindow <= 0) return null;

  const pct = Math.min(100, Math.round((usage.total / contextWindow) * 100));
  const compactAt = Math.max(0, contextWindow - reserveTokens);
  const compactionCount = countCompactions(messages);
  const breakdown = latestBreakdown(messages);
  const segments = buildSegments({ used: usage.total, contextWindow, reserveTokens, breakdown });

  const tone =
    pct >= 95
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : pct >= 80
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-border bg-elevated/40 text-fg-subtle hover:text-fg-muted';
  const fill = pct >= 95 ? 'bg-red-500/25' : pct >= 80 ? 'bg-amber-500/25' : 'bg-accent/25';

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Context usage"
          className={cn(
            'relative inline-flex overflow-hidden rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors',
            tone,
            className,
          )}
        >
          <span
            aria-hidden
            className={cn('absolute inset-y-0 left-0 transition-[width] duration-300', fill)}
            style={{ width: `${pct}%` }}
          />
          <span className="relative inline-flex items-center gap-1.5">
            <span>{pct}%</span>
            <span className="inline-flex items-center gap-1.5 @max-lg:hidden">
              <span className="opacity-60">·</span>
              <span>
                {compact(usage.total)} / {compact(contextWindow)}
              </span>
              {compactionCount > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="opacity-70">{compactionCount}×</span>
                </>
              )}
            </span>
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-[300px] rounded-lg border border-border bg-panel p-3 shadow-2xl"
        >
          <ContextPopover
            usage={usage}
            contextWindow={contextWindow}
            segments={segments}
            breakdown={breakdown}
            compactAt={compactAt}
            compactionCount={compactionCount}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
