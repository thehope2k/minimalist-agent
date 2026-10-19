import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextBreakdown } from '@/lib/electron';
import { compact, type Segment, type SegmentKey, type TurnUsage } from './usage';

const SWATCH: Record<SegmentKey, string> = {
  conversation: 'bg-accent',
  builtin: 'bg-sky-400',
  mcp: 'bg-emerald-400',
  system: 'bg-amber-400',
  project: 'bg-fg-muted',
  reserve: 'bg-fg-subtle/40',
  free: 'bg-elevated-2',
};

function pctOf(tokens: number, window: number): string {
  const pct = (tokens / window) * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function SegmentRow({
  segment,
  contextWindow,
  expandable,
  open,
  onToggle,
}: {
  segment: Segment;
  contextWindow: number;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', SWATCH[segment.key])} />
      <span className="truncate text-fg-muted">{segment.label}</span>
      {expandable && (
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-90',
          )}
          strokeWidth={2}
        />
      )}
    </span>
  );
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      {expandable ? (
        <button type="button" onClick={onToggle} className="min-w-0 text-left hover:text-fg">
          {label}
        </button>
      ) : (
        label
      )}
      <span className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
        <span className="text-fg-subtle">
          {segment.estimated && '≈'}
          {compact(segment.tokens)}
        </span>
        <span className="w-11 text-right text-fg">{pctOf(segment.tokens, contextWindow)}</span>
      </span>
    </div>
  );
}

function McpServers({ servers }: { servers: ContextBreakdown['mcpServers'] }) {
  return (
    <div className="mb-1 ml-[18px] space-y-0.5 border-l border-border/60 pl-2.5 text-[11px]">
      {servers.map((s) => (
        <div key={s.name} className="flex items-center justify-between gap-3">
          <span className="truncate text-fg-muted">
            {s.name}
            <span className="text-fg-subtle">
              {' · '}
              {s.count} tool{s.count === 1 ? '' : 's'}
              {s.deferredCount > 0 && `, ${s.deferredCount} not loaded`}
            </span>
          </span>
          <span className="shrink-0 font-mono tabular-nums text-fg-subtle">
            ≈{compact(s.tokens)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ContextPopover({
  usage,
  contextWindow,
  segments,
  breakdown,
  compactAt,
  compactionCount,
}: {
  usage: TurnUsage;
  contextWindow: number;
  segments: Segment[];
  breakdown: ContextBreakdown | null;
  compactAt: number;
  compactionCount: number;
}) {
  const [mcpOpen, setMcpOpen] = useState(false);
  const servers = breakdown?.mcpServers ?? [];
  const deferred = servers.reduce((sum, s) => sum + s.deferredTokens, 0);
  const willCompactSoon = usage.total >= compactAt;

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-fg">
            {pctOf(usage.total, contextWindow)} used
          </span>
          <span className="font-mono text-fg-subtle">
            {compact(usage.total)} / {compact(contextWindow)}
          </span>
        </div>
        <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-elevated-2">
          {segments
            .filter((s) => s.key !== 'free')
            .map((s) => (
              <div
                key={s.key}
                className={SWATCH[s.key]}
                style={{ width: `${(s.tokens / contextWindow) * 100}%` }}
              />
            ))}
        </div>
      </div>

      <div>
        {segments.map((s) => (
          <div key={s.key}>
            <SegmentRow
              segment={s}
              contextWindow={contextWindow}
              expandable={s.key === 'mcp' && servers.length > 0}
              open={mcpOpen}
              onToggle={() => setMcpOpen((v) => !v)}
            />
            {s.key === 'mcp' && mcpOpen && <McpServers servers={servers} />}
          </div>
        ))}
        {deferred > 0 && (
          <div className="flex items-center justify-between gap-3 py-0.5 text-fg-subtle">
            <span className="ml-[18px]">MCP tools not loaded</span>
            <span className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
              <span>≈{compact(deferred)}</span>
              <span className="w-11 text-right">—</span>
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1 border-t border-border/60 pt-2 text-[11px] text-fg-subtle">
        <div>
          {compactionCount > 0
            ? `Compacted ${compactionCount}× — older history summarised.`
            : 'Not yet compacted.'}{' '}
          {willCompactSoon
            ? 'Auto-compaction runs next turn.'
            : `Auto-compacts at ${compact(compactAt)} tokens.`}
        </div>
        {breakdown && <div>≈ estimated split; the total is measured.</div>}
        {usage.estimated && <div>Total is a post-compaction estimate.</div>}
      </div>
    </div>
  );
}
