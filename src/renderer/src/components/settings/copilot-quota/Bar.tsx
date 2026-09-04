import { useQuota, PLAN_LABELS, formatResetDate, usedPct, barColor } from './shared';

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

  // Detect billing format: AI Credits (dollar amounts) vs. legacy requests
  // AI Credits: typically 10-100 range, Legacy requests: 100-10000+
  const isAICredits = quota.entitlement != null && quota.entitlement < 1000;
  const formatValue = (val: number) => {
    return isAICredits ? `$${val.toFixed(2)}` : val.toLocaleString();
  };
  const unit = isAICredits ? 'AI credits' : 'requests';

  if (quota.unlimited) {
    // Better messaging for Enterprise pooled credits
    const isEnterprise = quota.planType === 'enterprise';
    const message = isEnterprise 
      ? 'Unlimited AI credits (org-pooled)'
      : 'Unlimited AI credits';
    
    return (
      <p className="mt-1.5 text-xs text-fg-subtle">
        {planLabel && <span className="font-medium text-fg-muted">{planLabel} · </span>}
        {message}
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
            <span className="font-medium text-fg">{formatValue(quota.used)}</span>
          )}
          {quota.entitlement != null && quota.used != null && (
            <> / {formatValue(quota.entitlement)} {unit}</>
          )}
          {quota.entitlement == null && quota.used != null && <> {unit} used</>}
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
            +{isAICredits ? `$${quota.overageCount.toFixed(2)}` : quota.overageCount.toLocaleString()} over limit
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
