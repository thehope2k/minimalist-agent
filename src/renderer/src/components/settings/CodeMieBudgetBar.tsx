import { useEffect, useRef, useState } from 'react';
import type { CodeMieBudget } from '@/lib/electron';

type State =
  | { status: 'loading' }
  | { status: 'ready'; budget: CodeMieBudget }
  | { status: 'error'; message: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
// Errors (often transient — e.g. a freshly-created SSO session not yet
// propagated to the analytics endpoint) shouldn't stick around as long as a
// successful read; retry them quickly instead of freezing the UI for 5 min.
const ERROR_CACHE_TTL_MS = 15 * 1000;
const cache = new Map<string, { budget: CodeMieBudget | { error: string }; fetchedAt: number }>();

function ttlFor(budget: CodeMieBudget | { error: string }): number {
  return 'error' in budget ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
}

function formatReset(value: string | undefined): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function barColor(usedPercent: number): string {
  if (usedPercent >= 100) return 'bg-red-500';
  if (usedPercent >= 90) return 'bg-red-400';
  if (usedPercent >= 75) return 'bg-orange-400';
  return 'bg-accent';
}

export function CodeMieBudgetBar({ connectionSlug }: { connectionSlug: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const slugRef = useRef(connectionSlug);
  slugRef.current = connectionSlug;

  useEffect(() => {
    const cached = cache.get(connectionSlug);
    if (cached && Date.now() - cached.fetchedAt < ttlFor(cached.budget)) {
      setState('error' in cached.budget ? { status: 'error', message: cached.budget.error } : { status: 'ready', budget: cached.budget });
      return;
    }

    setState({ status: 'loading' });
    void window.api.connections.fetchCodeMieBudget({ connectionSlug }).then((result) => {
      if (slugRef.current !== connectionSlug) return;
      cache.set(connectionSlug, { budget: result, fetchedAt: Date.now() });
      setState('error' in result ? { status: 'error', message: result.error } : { status: 'ready', budget: result });
    }).catch((error: unknown) => {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
  }, [connectionSlug]);

  if (state.status === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
        <div className="h-1 w-24 animate-pulse rounded-full bg-elevated-2" />
        <span>Loading budget…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return <p className="mt-1.5 text-xs text-fg-subtle">Budget unavailable · {state.message}</p>;
  }

  const { currentSpending, budgetLimit, usedPercent, resetAt } = state.budget;
  const filledPercent = Math.min(100, Math.max(0, Math.round(usedPercent)));
  const reset = formatReset(resetAt);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-muted">
          <span className="font-medium text-fg">${currentSpending.toFixed(2)}</span>
          {typeof budgetLimit === 'number' ? ` / $${budgetLimit.toFixed(2)}` : ''} spent
        </span>
        {reset && <span className="text-fg-subtle">Resets {reset}</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated-2">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor(usedPercent)}`} style={{ width: `${filledPercent}%` }} />
      </div>
      <span className={`text-xs ${usedPercent >= 90 ? 'text-red-400' : usedPercent >= 75 ? 'text-orange-400' : 'text-fg-subtle'}`}>
        {Math.round(usedPercent)}% of CodeMie budget used
      </span>
    </div>
  );
}
