// Quota usage widgets for GitHub Copilot connections.
//
// Backed by the same copilot_internal/user endpoint that IntelliJ / VS Code use.
// Returns percent_remaining directly — no math needed on the client side.
//
// Exports:
//   CopilotQuotaBar  — full-width bar for Settings → AI → Connections
//   CopilotQuotaPill — compact pill for the chat composer toolbar

import { useEffect, useRef, useState } from 'react';
import type { CopilotQuota } from '@/lib/electron';

// ── Shared cache ──────────────────────────────────────────────────────────────

export const quotaCache = new Map<
  string,
  { quota: CopilotQuota | { error: string }; fetchedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

type QuotaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quota: CopilotQuota }
  | { status: 'error'; message: string };

function useQuota(connectionSlug: string, enabled: boolean, refreshKey = 0): QuotaState {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  individual: 'Individual',
  individual_pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

function formatResetDate(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** percentRemaining → how much of the bar is USED (filled). */
function usedPct(pct: number): number {
  return Math.min(100, Math.max(0, 100 - pct));
}

function barColor(used: number, hasOverage: boolean): string {
  if (hasOverage) return 'bg-red-500';
  if (used >= 90) return 'bg-red-400';
  if (used >= 75) return 'bg-orange-400';
  return 'bg-accent';
}

// ── Settings bar (full-width) ─────────────────────────────────────────────────

export function CopilotQuotaBar({ connectionSlug }: { connectionSlug: string }) {
  const state = useQuota(connectionSlug, true);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
        <div className="h-1 w-24 animate-pulse rounded-full bg-elevated-2" />
        <span>Loading quota…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="mt-1.5 text-xs text-fg-subtle">
        Could not load quota
        {' — '}
        <span className="text-fg-subtle/70">{state.message}</span>
      </p>
    );
  }

  const { quota } = state;
  const planLabel = quota.planType ? (PLAN_LABELS[quota.planType] ?? quota.planType) : null;
  const filled = usedPct(quota.percentRemaining);     // capped 0–100 for bar width
  // True percentage for the label — can exceed 100% when over quota.
  const displayPct = quota.entitlement && quota.used != null
    ? Math.round((quota.used / quota.entitlement) * 100)
    : Math.round(100 - quota.percentRemaining);
  const hasOverage = quota.overageCount > 0;

  if (quota.unlimited) {
    return (
      <p className="mt-1.5 text-xs text-fg-subtle">
        {planLabel && <span className="font-medium text-fg-muted">{planLabel} · </span>}
        Unlimited premium requests
        {quota.resetDate && (
          <> · resets <span className="text-fg-muted">{formatResetDate(quota.resetDate)}</span></>
        )}
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      {/* Label row */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-fg-muted">
          {quota.used != null && (
            <span className="font-medium text-fg">{quota.used.toLocaleString()}</span>
          )}
          {quota.entitlement != null && quota.used != null && (
            <> / {quota.entitlement.toLocaleString()} requests</>
          )}
          {quota.entitlement == null && quota.used != null && <> requests used</>}
          {planLabel && <span className="ml-1.5 text-fg-subtle">({planLabel})</span>}
        </span>
        {quota.resetDate && (
          <span className="text-xs text-fg-subtle">Resets {formatResetDate(quota.resetDate)}</span>
        )}
      </div>

      {/* Progress bar — filled = used */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated-2">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor(filled, hasOverage)}`}
          style={{ width: `${filled}%` }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className={`text-xs ${displayPct >= 90 ? 'text-red-400' : displayPct >= 75 ? 'text-orange-400' : 'text-fg-subtle'}`}>
          {displayPct}% used
        </span>
        {hasOverage && (
          <span className="text-xs text-red-400">
            +{quota.overageCount.toLocaleString()} over limit
            {quota.overagePermitted ? ' (grace enabled)' : ''}
          </span>
        )}
        {!hasOverage && quota.overagePermitted && (
          <span className="text-xs text-fg-subtle">Grace overage enabled</span>
        )}
      </div>
    </div>
  );
}

// ── Chat toolbar pill (compact) ───────────────────────────────────────────────

export function CopilotQuotaPill({
  connectionSlug,
  isCopilot,
  isStreaming,
}: {
  connectionSlug: string;
  isCopilot: boolean;
  isStreaming?: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useQuota(connectionSlug, isCopilot, refreshKey);

  // When a turn finishes (streaming → idle), bust the cache and re-fetch
  // so the pill reflects requests consumed by that turn.
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current === true && isStreaming === false && isCopilot) {
      quotaCache.delete(connectionSlug);
      setRefreshKey((k) => k + 1);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, connectionSlug, isCopilot]);
  if (!isCopilot || state.status !== 'ok') return null;

  const { quota } = state;

  if (quota.unlimited) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] leading-none text-fg-subtle"
        title={`${PLAN_LABELS[quota.planType ?? ''] ?? quota.planType ?? 'Copilot'} · unlimited premium requests`}
      >
        ∞
      </span>
    );
  }

  const filled = usedPct(quota.percentRemaining);
  const hasOverage = quota.overageCount > 0;
  // True % for labels/tooltip — uncapped, so 132% shows correctly.
  const displayPct = quota.entitlement && quota.used != null
    ? Math.round((quota.used / quota.entitlement) * 100)
    : Math.round(100 - quota.percentRemaining);
  const isRed = hasOverage || displayPct >= 90;
  const isOrange = !isRed && displayPct >= 75;

  const colorClass = isRed
    ? 'border-red-500/40 text-red-400'
    : isOrange
      ? 'border-orange-400/40 text-orange-400'
      : 'border-border text-fg-subtle';

  const label = quota.entitlement != null && quota.used != null
    ? `${quota.used}/${quota.entitlement}`
    : `${displayPct}%`;

  const planLabel = quota.planType ? (PLAN_LABELS[quota.planType] ?? quota.planType) : '';
  const tooltipParts: string[] = [];
  if (planLabel) tooltipParts.push(planLabel);
  tooltipParts.push(`${displayPct}% used`);
  if (hasOverage) tooltipParts.push(`+${quota.overageCount} over limit`);
  if (quota.resetDate) tooltipParts.push(`resets ${formatResetDate(quota.resetDate)}`);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${colorClass}`}
      title={tooltipParts.join(' · ')}
    >
      {label}
    </span>
  );
}
