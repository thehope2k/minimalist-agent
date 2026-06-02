import { Check, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  isResolved: boolean;
  resolving: boolean;
  resolveError: string | null;
  conflictCount: number;
  focusedIndex: number;
  onMarkResolved: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
};

export function ConflictToolbar({
  isResolved,
  resolving,
  resolveError,
  conflictCount,
  focusedIndex,
  onMarkResolved,
  onNavigatePrev,
  onNavigateNext,
}: Props) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          onClick={onMarkResolved}
          disabled={!isResolved || resolving}
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
            isResolved
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
              : 'cursor-not-allowed bg-elevated text-fg-subtle',
          )}
          title={
            isResolved
              ? 'All conflicts resolved — save this file'
              : 'Remove conflict markers before marking resolved'
          }
        >
          {resolving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-3 w-3" strokeWidth={2} />
              Mark Resolved
            </>
          )}
        </button>
        {resolveError && (
          <span className="text-xs text-red-300">{resolveError}</span>
        )}
      </div>

      {conflictCount > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-fg-muted">
            {focusedIndex + 1} / {conflictCount}
          </span>
          <button
            onClick={onNavigatePrev}
            disabled={conflictCount <= 1}
            className="rounded p-1 text-fg-muted hover:bg-elevated hover:text-fg disabled:opacity-30"
            title="Previous conflict (Shift+Alt+,)"
          >
            <ChevronUp className="h-3 w-3" strokeWidth={2} />
          </button>
          <button
            onClick={onNavigateNext}
            disabled={conflictCount <= 1}
            className="rounded p-1 text-fg-muted hover:bg-elevated hover:text-fg disabled:opacity-30"
            title="Next conflict (Shift+Alt+.)"
          >
            <ChevronDown className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
