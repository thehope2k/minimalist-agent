// Banner displayed inside the GitDiffModal left panel when a repo is in a
// MERGE / REBASE / CHERRY-PICK / REVERT state.
//
// Rebase-specific additions vs merge:
//   • Progress bar + "Commit N / M" counter (from .git/rebase-merge/msgnum+end)
//   • Subject line of the commit currently being replayed
//   • "Continue Rebase" label (instead of "Complete Merge")
//
// "Continue" is enabled only when conflictCount === 0.

import { AlertTriangle, Check, GitMerge, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MergeOperationType, RebaseProgress } from './types';

interface MergeStateBannerProps {
  type: MergeOperationType;
  headLabel: string | null;
  incomingLabel: string | null;
  mergeMessage: string | null;
  conflictCount: number;
  rebaseProgress?: RebaseProgress;
  aborting: boolean;
  continuing: boolean;
  error: string | null;
  onAbort: () => void;
  onContinue: () => void;
  onClearError: () => void;
}

const OP_LABELS: Record<MergeOperationType, string> = {
  merge:         'Merge in progress',
  rebase:        'Rebase in progress',
  'cherry-pick': 'Cherry-pick in progress',
  revert:        'Revert in progress',
  none:          '',
};

const CONTINUE_LABELS: Record<MergeOperationType, string> = {
  merge:         'Complete Merge',
  rebase:        'Continue Rebase',
  'cherry-pick': 'Continue',
  revert:        'Continue Revert',
  none:          'Continue',
};

const ABORT_LABELS: Record<MergeOperationType, string> = {
  merge:         'Abort Merge',
  rebase:        'Abort Rebase',
  'cherry-pick': 'Abort Cherry-pick',
  revert:        'Abort Revert',
  none:          'Abort',
};

export function MergeStateBanner({
  type,
  headLabel,
  incomingLabel,
  mergeMessage: _mergeMessage,
  conflictCount,
  rebaseProgress,
  aborting,
  continuing,
  error,
  onAbort,
  onContinue,
  onClearError,
}: MergeStateBannerProps) {
  if (type === 'none') return null;

  const allResolved = conflictCount === 0;
  const busy = aborting || continuing;
  const progressPct = rebaseProgress
    ? Math.round((rebaseProgress.current / rebaseProgress.total) * 100)
    : null;

  return (
    <div
      className={cn(
        'shrink-0 border-b px-3 py-2.5',
        allResolved
          ? 'border-emerald-500/30 bg-emerald-500/8'
          : 'border-amber-500/30 bg-amber-500/8',
      )}
    >
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          {allResolved
            ? <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />
            : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.75} />
          }
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn(
              'text-[11px] font-medium leading-tight',
              allResolved ? 'text-emerald-300' : 'text-amber-300',
            )}>
              {OP_LABELS[type]}
            </p>
            {/* Rebase commit counter badge */}
            {rebaseProgress && (
              <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-fg-muted">
                {rebaseProgress.current}/{rebaseProgress.total}
              </span>
            )}
          </div>

          {/* Branch labels */}
          {(headLabel || incomingLabel) && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-fg-subtle">
              {incomingLabel && (
                <span className="text-blue-400">{incomingLabel}</span>
              )}
              {incomingLabel && headLabel && (
                <span className="mx-1 text-fg-subtle">→</span>
              )}
              {headLabel && (
                <span className="text-fg-muted">{headLabel}</span>
              )}
            </p>
          )}

          {/* Rebase: subject line of the commit being replayed */}
          {rebaseProgress?.commitMessage && (
            <p
              className="mt-1 truncate font-mono text-[10px] italic text-fg-subtle"
              title={rebaseProgress.commitMessage}
            >
              "{rebaseProgress.commitMessage}"
            </p>
          )}
        </div>

        {/* Conflict count badge */}
        {conflictCount > 0 && (
          <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-300">
            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Rebase progress bar ─────────────────────────────────────── */}
      {progressPct !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-elevated">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                allResolved ? 'bg-emerald-500/70' : 'bg-accent/60',
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">
            {progressPct}%
          </span>
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={!allResolved || busy}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
            'focus-visible:outline-none',
            allResolved && !busy
              ? 'bg-emerald-500/80 text-white hover:bg-emerald-500'
              : 'cursor-not-allowed bg-elevated text-fg-subtle',
          )}
        >
          {continuing
            ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
            : <GitMerge className="h-3 w-3" strokeWidth={1.75} />
          }
          {CONTINUE_LABELS[type]}
        </button>

        <button
          type="button"
          onClick={onAbort}
          disabled={busy}
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors',
            'focus-visible:outline-none',
            !busy
              ? 'text-red-400 hover:bg-red-500/10'
              : 'cursor-not-allowed text-fg-subtle',
          )}
        >
          {aborting
            ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
            : <X className="h-3 w-3" strokeWidth={1.75} />
          }
          {ABORT_LABELS[type]}
        </button>
      </div>

      {/* ── Error display ────────────────────────────────────────────── */}
      {error && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded bg-red-500/10 px-2 py-1.5">
          <p className="font-mono text-[10px] leading-relaxed text-red-400">{error}</p>
          <button
            type="button"
            onClick={onClearError}
            className="shrink-0 text-red-400/60 hover:text-red-400 focus-visible:outline-none"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
