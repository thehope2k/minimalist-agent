import { AlignLeft, Columns2, GitBranch, GitMerge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MergeOperationType } from '../types';

interface GitHeaderProps {
  cwd: string | null;
  totalFiles: number;
  splitView: boolean;
  onToggleSplit: () => void;
  /** Set when a merge / rebase / cherry-pick is in progress. */
  mergeType?: MergeOperationType;
  conflictCount?: number;
}

function shortenCwd(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, '~/');
}

export function GitHeader({ cwd, totalFiles, splitView, onToggleSplit, mergeType, conflictCount }: GitHeaderProps) {
  const inMerge = mergeType && mergeType !== 'none';
  return (
    <div className="flex w-full items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {inMerge
          ? <GitMerge className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.75} />
          : <GitBranch className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
        }
        <span className="text-sm font-medium text-fg">Git Changes</span>
        {totalFiles > 0 && (
          <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">
            {totalFiles}
          </span>
        )}
        {inMerge && conflictCount != null && conflictCount > 0 && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-300">
            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-fg-subtle">·</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
          {cwd ? shortenCwd(cwd) : 'No working directory'}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleSplit}
          title={splitView ? 'Switch to unified view' : 'Switch to split view'}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
            'text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-none',
          )}
        >
          {splitView
            ? <><Columns2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Split</>
            : <><AlignLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Unified</>
          }
        </button>
      </div>
    </div>
  );
}
