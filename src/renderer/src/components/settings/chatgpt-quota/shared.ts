// Shared quota-fetching hook, cache, and formatting helpers used by both
// ChatGptQuotaBar (Settings) and ChatGptQuotaPill (chat toolbar).
//
// Backed by the same wham/usage endpoint Codex CLI itself polls. Unlike
// Copilot's monthly entitlement, Codex reports rolling usage windows
// (typically 5h + 7d) with their own reset times.
import { useEffect, useRef, useState } from 'react';
import type { ChatGptQuota } from '@/lib/electron';

export const quotaCache = new Map<
  string,
  { quota: ChatGptQuota | { error: string }; fetchedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export type QuotaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quota: ChatGptQuota }
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

    setState((prev) => (prev.status === 'ok' ? prev : { status: 'loading' }));
    void window.api.chatgpt.fetchQuota({ connectionSlug }).then((result) => {
      if (slugRef.current !== connectionSlug) return;
      quotaCache.set(connectionSlug, { quota: result, fetchedAt: Date.now() });
      applyResult(result);
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: 'error', message });
    });

    function applyResult(result: ChatGptQuota | { error: string }) {
      if ('error' in result) setState({ status: 'error', message: result.error });
      else setState({ status: 'ok', quota: result });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionSlug, enabled, refreshKey]);

  return state;
}

export const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
};

export function formatWindowLabel(windowMinutes: number | null): string {
  if (windowMinutes == null) return 'window';
  if (windowMinutes % MINUTES_PER_DAY === 0) return `${windowMinutes / MINUTES_PER_DAY}d`;
  if (windowMinutes % MINUTES_PER_HOUR === 0) return `${windowMinutes / MINUTES_PER_HOUR}h`;
  return `${windowMinutes}m`;
}

export function formatResetsAt(resetsAt: number | null): string {
  if (resetsAt == null) return '';
  return new Date(resetsAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function barColor(usedPercent: number): string {
  if (usedPercent >= 100) return 'bg-red-500';
  if (usedPercent >= 90) return 'bg-red-400';
  if (usedPercent >= 75) return 'bg-orange-400';
  return 'bg-accent';
}
