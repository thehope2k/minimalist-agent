import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@/components/ui';
import type { CopilotQuota } from '@/lib/electron';
import { useQuota, quotaCache, PLAN_LABELS, formatResetDate } from './shared';

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

  // `useQuota` keeps `status: 'ok'` (with the stale quota) while a manual
  // refetch is in flight, so we can't derive "is refreshing" from state.status
  // alone. Instead: a fetch is only ever in flight between refresh() and the
  // *next terminal state* (ok or error) reported by useQuota — clear on both,
  // so a failed refresh doesn't leave the button stuck disabled.
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Last successfully-loaded quota, kept around so a failed *refresh* (as
  // opposed to the initial load) doesn't blank the pill — we still have
  // something real to show, just flagged as stale.
  const [lastGoodQuota, setLastGoodQuota] = useState<CopilotQuota | null>(null);
  useEffect(() => {
    if (state.status === 'ok') {
      setLastGoodQuota(state.quota);
      setIsRefreshing(false);
    } else if (state.status === 'error') {
      setIsRefreshing(false);
    }
  }, [state]);

  const refresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    quotaCache.delete(connectionSlug);
    setRefreshKey((k) => k + 1);
  };

  if (!isCopilot) return null;

  const refreshFailed = state.status === 'error';
  const quota = state.status === 'ok' ? state.quota : lastGoodQuota;
  // No data to show at all (first load failed/pending) — nothing to render.
  if (!quota) return null;

  const failureNote = refreshFailed
    ? [`refresh failed: ${state.status === 'error' ? state.message : ''}`]
    : [];

  if (quota.unlimited) {
    const isEnterprise = quota.planType === 'enterprise';
    const title = isEnterprise
      ? `${PLAN_LABELS[quota.planType ?? ''] ?? quota.planType ?? 'Copilot'} · unlimited AI credits (org-pooled)`
      : `${PLAN_LABELS[quota.planType ?? ''] ?? quota.planType ?? 'Copilot'} · unlimited AI credits`;

    return (
      <Tooltip content={[title, ...failureNote, 'click to refresh'].join(' · ')}>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none transition-opacity cursor-pointer hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${refreshFailed ? 'border-orange-400/40 text-orange-400' : 'border-border text-fg-subtle'}`}
        >
          ∞{refreshFailed ? ' ⚠' : ''}
        </button>
      </Tooltip>
    );
  }

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

  // Detect AI Credits format (dollar amounts)
  const isAICredits = quota.entitlement != null && quota.entitlement < 1000;
  const formatCompact = (val: number) => {
    return isAICredits ? `$${val.toFixed(0)}` : val.toLocaleString();
  };

  const label = quota.entitlement != null && quota.used != null
    ? `${formatCompact(quota.used)}/${formatCompact(quota.entitlement)}`
    : `${displayPct}%`;

  const planLabel = quota.planType ? (PLAN_LABELS[quota.planType] ?? quota.planType) : '';
  const tooltipParts: string[] = [];
  if (planLabel) tooltipParts.push(planLabel);
  tooltipParts.push(`${displayPct}% used`);
  if (hasOverage) {
    const overageStr = isAICredits ? `$${quota.overageCount.toFixed(2)}` : quota.overageCount.toLocaleString();
    tooltipParts.push(`+${overageStr} over limit`);
  }
  if (quota.resetDate) tooltipParts.push(`resets ${formatResetDate(quota.resetDate)}`);
  tooltipParts.push(...failureNote);
  tooltipParts.push('click to refresh');

  return (
    <Tooltip content={tooltipParts.join(' · ')}>
      <button
        type="button"
        onClick={refresh}
        disabled={isRefreshing}
        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none tabular-nums transition-opacity cursor-pointer hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${refreshFailed ? 'border-orange-400/40 text-orange-400' : colorClass}`}
      >
        {isRefreshing ? '…' : label}{refreshFailed && !isRefreshing ? ' ⚠' : ''}
      </button>
    </Tooltip>
  );
}
