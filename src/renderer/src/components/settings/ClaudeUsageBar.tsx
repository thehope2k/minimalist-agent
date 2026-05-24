import { useEffect, useRef, useState } from 'react';
import type { ClaudeUsageEntry } from '@/lib/electron';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; entries: ClaudeUsageEntry[] }
  | { status: 'error'; message: string };

const CACHE_TTL_MS = 60_000;
const usageCache = new Map<
  string,
  { entries: ClaudeUsageEntry[] | { error: string }; fetchedAt: number }
>();

const LABELS: Record<ClaudeUsageEntry['rateLimitType'], string> = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d Opus',
  seven_day_sonnet: '7d Sonnet',
  overage: 'Overage',
};

function useClaudeUsage(connectionSlug: string): State {
  const [state, setState] = useState<State>({ status: 'idle' });
  const slugRef = useRef(connectionSlug);
  slugRef.current = connectionSlug;

  useEffect(() => {
    const cached = usageCache.get(connectionSlug);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      apply(cached.entries);
      return;
    }

    setState((prev) => (prev.status === 'ok' ? prev : { status: 'loading' }));
    void window.api.claude.fetchUsage({ connectionSlug }).then((result) => {
      if (slugRef.current !== connectionSlug) return;
      usageCache.set(connectionSlug, { entries: result, fetchedAt: Date.now() });
      apply(result);
    }).catch((err: unknown) => {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    });

    function apply(result: ClaudeUsageEntry[] | { error: string }) {
      if ('error' in result) setState({ status: 'error', message: result.error });
      else setState({ status: 'ok', entries: result });
    }
  }, [connectionSlug]);

  return state;
}

function colorFor(utilization: number): string {
  if (utilization >= 1) return 'text-red-400 border-red-500/40';
  if (utilization >= 0.9) return 'text-orange-400 border-orange-400/40';
  return 'text-fg-subtle border-border';
}

export function ClaudeUsageBar({ connectionSlug }: { connectionSlug: string }) {
  const state = useClaudeUsage(connectionSlug);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
        <div className="h-1 w-24 animate-pulse rounded-full bg-elevated-2" />
        <span>Loading usage…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="mt-1.5 text-xs text-fg-subtle">
        Could not load usage · <span className="text-fg-subtle/70">{state.message}</span>
      </p>
    );
  }

  if (state.entries.length === 0) {
    return <p className="mt-1.5 text-xs text-fg-subtle">No usage buckets returned.</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {state.entries.map((entry) => {
        const pct = Math.round(entry.utilization * 100);
        return (
          <span
            key={entry.rateLimitType}
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${colorFor(entry.utilization)}`}
            title={entry.resetsAt ? `Resets ${new Date(entry.resetsAt).toLocaleString()}` : undefined}
          >
            {LABELS[entry.rateLimitType]} {pct}%
          </span>
        );
      })}
    </div>
  );
}
