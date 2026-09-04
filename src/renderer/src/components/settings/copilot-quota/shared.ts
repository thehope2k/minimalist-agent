// Shared quota-fetching hook, cache, and formatting helpers used by both
// CopilotQuotaBar (Settings) and CopilotQuotaPill (chat toolbar).
//
// Backed by the same copilot_internal/user endpoint that IntelliJ / VS Code use.
// Returns percent_remaining directly — no math needed on the client side.
import { useEffect, useRef, useState } from 'react';
import type { CopilotQuota } from '@/lib/electron';

export const quotaCache = new Map<
  string,
  { quota: CopilotQuota | { error: string }; fetchedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export type QuotaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quota: CopilotQuota }
  | { status: 'error'; message: string };

export function useQuota(connectionSlug: string, enabled: boolean, refreshKey = 0): QuotaState {
  const [state, setState] = useState<QuotaState>({ status: 'idle' });
  const slugRef = useRef(connectionSlug);
  slugRef.current = connectionSlug;

  useEffect(() => {
    if (!enabled) return;

    const cached = quotaCache.get(connectionSlug);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      applyResult(cached.quota);
      return;
    }

    setState((prev) => prev.status === 'ok' ? prev : { status: 'loading' });
    void window.api.copilot.fetchQuota({ connectionSlug }).then((result) => {
      if (slugRef.current !== connectionSlug) return;
      quotaCache.set(connectionSlug, { quota: result, fetchedAt: Date.now() });
      applyResult(result);
    }).catch((err: unknown) => {
      // Unhandled IPC failure (e.g. preload/main mismatch in dev)
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: 'error', message });
    });

    function applyResult(result: CopilotQuota | { error: string }) {
      if ('error' in result) setState({ status: 'error', message: result.error });
      else setState({ status: 'ok', quota: result });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionSlug, enabled, refreshKey]);

  return state;
}

export const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  individual: 'Individual',
  individual_pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

export function formatResetDate(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** percentRemaining → how much of the bar is USED (filled). */
export function usedPct(pct: number): number {
  return Math.min(100, Math.max(0, 100 - pct));
}

export function barColor(used: number, hasOverage: boolean): string {
  if (hasOverage) return 'bg-red-500';
  if (used >= 90) return 'bg-red-400';
  if (used >= 75) return 'bg-orange-400';
  return 'bg-accent';
}
