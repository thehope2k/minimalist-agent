import { useQuota, PLAN_LABELS, formatWindowLabel, formatResetsAt, barColor } from './shared';
import type { ChatGptRateLimitWindow } from '@/lib/electron';

function WindowRow({ window }: { window: ChatGptRateLimitWindow }) {
  const pct = Math.min(100, Math.max(0, Math.round(window.usedPercent)));
  const label = formatWindowLabel(window.windowMinutes);
  const resetsAt = formatResetsAt(window.resetsAt);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-fg-muted">{label} window</span>
        <span className={`text-xs ${window.usedPercent >= 90 ? 'text-red-400' : window.usedPercent >= 75 ? 'text-orange-400' : 'text-fg-subtle'}`}>
          {Math.round(window.usedPercent)}% used
          {resetsAt && <span className="ml-1.5 text-fg-subtle">· resets {resetsAt}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated-2">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor(window.usedPercent)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ChatGptQuotaBar({ connectionSlug }: { connectionSlug: string }) {
  const state = useQuota(connectionSlug, true);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
        <div className="h-1 w-24 animate-pulse rounded-full bg-elevated-2" />
        <span>Loading usage…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="mt-1.5 text-xs text-fg-subtle">
        Could not load usage
        {' — '}
        <span className="text-fg-subtle/70">{state.message}</span>
      </p>
    );
  }

  const { quota } = state;
  const planLabel = quota.planType ? (PLAN_LABELS[quota.planType] ?? quota.planType) : null;

  if (!quota.primary && !quota.secondary) {
    return (
      <p className="mt-1.5 text-xs text-fg-subtle">
        {planLabel && <span className="font-medium text-fg-muted">{planLabel} · </span>}
        No rate-limit data reported.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {planLabel && <span className="text-xs font-medium text-fg-muted">{planLabel}</span>}
      {quota.primary && <WindowRow window={quota.primary} />}
      {quota.secondary && <WindowRow window={quota.secondary} />}
      {quota.creditsBalance != null && !quota.unlimitedCredits && (
        <p className="text-xs text-fg-subtle">${quota.creditsBalance} on-demand credits</p>
      )}
    </div>
  );
}
