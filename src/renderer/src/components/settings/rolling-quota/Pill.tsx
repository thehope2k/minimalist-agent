import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@/components/ui';
import type { RollingQuota } from '@/lib/electron';
import {
  useQuota,
  quotaCache,
  PLAN_LABELS,
  formatWindowLabel,
  formatResetsAt,
  type QuotaSource,
} from './shared';

export function RollingQuotaPill({
  source,
  connectionSlug,
  enabled,
  isStreaming,
}: {
  source: QuotaSource;
  connectionSlug: string;
  enabled: boolean;
  isStreaming?: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useQuota(source, connectionSlug, enabled, refreshKey);

  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current === true && isStreaming === false && enabled) {
      quotaCache.delete(connectionSlug);
      setRefreshKey((k) => k + 1);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, connectionSlug, enabled]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastGoodQuota, setLastGoodQuota] = useState<RollingQuota | null>(null);
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

  if (!enabled) return null;

  const refreshFailed = state.status === 'error';
  const quota = state.status === 'ok' ? state.quota : lastGoodQuota;
  if (!quota) return null;

  const failureNote = refreshFailed
    ? [`refresh failed: ${state.status === 'error' ? state.message : ''}`]
    : [];

  const headline = quota.primary ?? quota.secondary;
  if (!headline) {
    return (
      <Tooltip
        content={['No rate-limit data reported', ...failureNote, 'click to refresh'].join(' · ')}
      >
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] leading-none text-fg-subtle transition-opacity cursor-pointer hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ?
        </button>
      </Tooltip>
    );
  }

  const displayPct = Math.round(headline.usedPercent);
  const isRed = displayPct >= 90;
  const isOrange = !isRed && displayPct >= 75;
  const colorClass = isRed
    ? 'border-red-500/40 text-red-400'
    : isOrange
      ? 'border-orange-400/40 text-orange-400'
      : 'border-border text-fg-subtle';

  const planLabel = quota.planType ? (PLAN_LABELS[quota.planType] ?? quota.planType) : '';
  const tooltipParts: string[] = [];
  if (planLabel) tooltipParts.push(planLabel);
  tooltipParts.push(`${formatWindowLabel(headline.windowMinutes)} window: ${displayPct}% used`);
  if (quota.secondary && quota.secondary !== headline) {
    tooltipParts.push(
      `${formatWindowLabel(quota.secondary.windowMinutes)} window: ${Math.round(quota.secondary.usedPercent)}% used`,
    );
  }
  for (const { label, window } of quota.extraWindows ?? []) {
    tooltipParts.push(`${label} window: ${Math.round(window.usedPercent)}% used`);
  }
  const resetsAt = formatResetsAt(headline.resetsAt);
  if (resetsAt) tooltipParts.push(`resets ${resetsAt}`);
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
        {isRefreshing ? '…' : `${displayPct}%`}
        {refreshFailed && !isRefreshing ? ' ⚠' : ''}
      </button>
    </Tooltip>
  );
}
