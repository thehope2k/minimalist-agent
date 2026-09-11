import { useBudget, formatReset, barColor } from './shared';

export function CodeMieBudgetBar({ connectionSlug }: { connectionSlug: string }) {
  const state = useBudget(connectionSlug, true);

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
