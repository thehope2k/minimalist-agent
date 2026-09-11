// Shared budget-fetching hook, cache, and formatting helpers used by both
// CodeMieBudgetBar (Settings) and CodeMieBudgetPill (chat toolbar).
//
// Backed by the same /v1/analytics/budget_usage endpoint the CodeMie web
// console reads. Errors are cached with a much shorter TTL since they're
// often transient (e.g. a freshly-created SSO session not yet propagated).
import { useEffect, useRef, useState } from 'react';
import type { CodeMieBudget } from '@/lib/electron';

export const budgetCache = new Map<
  string,
  { budget: CodeMieBudget | { error: string }; fetchedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 15 * 1000;

function ttlFor(budget: CodeMieBudget | { error: string }): number {
  return 'error' in budget ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
}

export type BudgetState =
  | { status: 'loading' }
  | { status: 'ready'; budget: CodeMieBudget }
  | { status: 'error'; message: string };

export function useBudget(connectionSlug: string, enabled: boolean, refreshKey = 0): BudgetState {
  const [state, setState] = useState<BudgetState>({ status: 'loading' });
  const slugRef = useRef(connectionSlug);
  slugRef.current = connectionSlug;

  useEffect(() => {
    if (!enabled) return;

    const cached = budgetCache.get(connectionSlug);
    if (cached && Date.now() - cached.fetchedAt < ttlFor(cached.budget)) {
      applyResult(cached.budget);
      return;
    }

    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    void window.api.connections.fetchCodeMieBudget({ connectionSlug }).then((result) => {
      if (slugRef.current !== connectionSlug) return;
      budgetCache.set(connectionSlug, { budget: result, fetchedAt: Date.now() });
      applyResult(result);
    }).catch((err: unknown) => {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    });

    function applyResult(result: CodeMieBudget | { error: string }) {
      if ('error' in result) setState({ status: 'error', message: result.error });
      else setState({ status: 'ready', budget: result });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionSlug, enabled, refreshKey]);

  return state;
}

export function formatReset(value: string | undefined): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function barColor(usedPercent: number): string {
  if (usedPercent >= 100) return 'bg-red-500';
  if (usedPercent >= 90) return 'bg-red-400';
  if (usedPercent >= 75) return 'bg-orange-400';
  return 'bg-accent';
}
