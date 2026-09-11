import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@/components/ui';
import type { CodeMieBudget } from '@/lib/electron';
import { useBudget, budgetCache, formatReset } from './shared';

export function CodeMieBudgetPill({
  connectionSlug,
  isCodeMie,
  isStreaming,
}: {
  connectionSlug: string;
  isCodeMie: boolean;
  isStreaming?: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useBudget(connectionSlug, isCodeMie, refreshKey);

  // When a turn finishes (streaming → idle), bust the cache and re-fetch so
  // the pill reflects spend consumed by that turn.
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current === true && isStreaming === false && isCodeMie) {
      budgetCache.delete(connectionSlug);
      setRefreshKey((k) => k + 1);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, connectionSlug, isCodeMie]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  // Last successfully-loaded budget, kept around so a failed *refresh* (as
  // opposed to the initial load) doesn't blank the pill.
  const [lastGoodBudget, setLastGoodBudget] = useState<CodeMieBudget | null>(null);
  useEffect(() => {
    if (state.status === 'ready') {
      setLastGoodBudget(state.budget);
      setIsRefreshing(false);
    } else if (state.status === 'error') {
      setIsRefreshing(false);
    }
  }, [state]);

  const refresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    budgetCache.delete(connectionSlug);
    setRefreshKey((k) => k + 1);
  };

  if (!isCodeMie) return null;

  const refreshFailed = state.status === 'error';
  const budget = state.status === 'ready' ? state.budget : lastGoodBudget;
  if (!budget) return null;

  const failureNote = refreshFailed
    ? [`refresh failed: ${state.status === 'error' ? state.message : ''}`]
    : [];

  const filledPercent = Math.min(100, Math.max(0, Math.round(budget.usedPercent)));
  const isRed = filledPercent >= 100 || filledPercent >= 90;
  const isOrange = !isRed && filledPercent >= 75;
  const colorClass = isRed
    ? 'border-red-500/40 text-red-400'
    : isOrange
      ? 'border-orange-400/40 text-orange-400'
      : 'border-border text-fg-subtle';

  const label = typeof budget.budgetLimit === 'number'
    ? `$${budget.currentSpending.toFixed(0)}/$${budget.budgetLimit.toFixed(0)}`
    : `$${budget.currentSpending.toFixed(0)}`;

  const tooltipParts: string[] = [`${filledPercent}% of budget used`];
  const reset = formatReset(budget.resetAt);
  if (reset) tooltipParts.push(`resets ${reset}`);
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
