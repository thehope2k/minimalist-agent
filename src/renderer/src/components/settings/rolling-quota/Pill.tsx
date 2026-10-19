import { useEffect, useRef, useState } from 'react';
import { UsagePill } from '@/components/ui';
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
      <UsagePill
        tooltip={['No rate-limit data reported', ...failureNote, 'click to refresh'].join(' · ')}
        onClick={refresh}
        disabled={isRefreshing}
        tone="border-border text-fg-subtle"
      >
        ?
      </UsagePill>
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
    <UsagePill
      tooltip={tooltipParts.join(' · ')}
      onClick={refresh}
      disabled={isRefreshing}
      tone={refreshFailed ? 'border-orange-400/40 text-orange-400' : colorClass}
    >
      {isRefreshing ? '…' : `${displayPct}%`}
      {refreshFailed && !isRefreshing ? ' ⚠' : ''}
    </UsagePill>
  );
}
