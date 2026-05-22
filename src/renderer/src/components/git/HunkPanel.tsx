// Hunk selector shown above the Monaco diff panel.
// Each diff hunk gets a checkbox — checking/unchecking controls whether
// that chunk of changes is included in the commit.
//
// All hunks default to staged (checked). Unchecking a hunk reverts it
// to the original content in the committed version, while the disk file
// is left completely untouched.

import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hunkLabel, hunkRange } from './git-util';
import type { LineChange } from './types';

interface HunkPanelProps {
  changes: LineChange[];
  stagedIndices: Set<number>;
  onToggle: (index: number) => void;
}

function HunkCheckbox({ checked, indeterminate, onClick }: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer',
        checked || indeterminate
          ? 'border-accent bg-accent'
          : 'border-border-strong bg-transparent hover:border-accent/70',
      )}
    >
      {indeterminate
        ? <Minus className="h-2.5 w-2.5 text-accent-fg" strokeWidth={3} />
        : checked
          ? <Check className="h-2.5 w-2.5 text-accent-fg" strokeWidth={2.5} />
          : null
      }
    </div>
  );
}

export function HunkPanel({ changes, stagedIndices, onToggle }: HunkPanelProps) {
  if (changes.length === 0) return null;

  const allStaged = stagedIndices.size === changes.length;
  const noneStaged = stagedIndices.size === 0;

  const toggleAll = () => {
    if (allStaged) {
      // Deselect all
      changes.forEach((_, i) => {
        if (stagedIndices.has(i)) onToggle(i);
      });
    } else {
      // Select all
      changes.forEach((_, i) => {
        if (!stagedIndices.has(i)) onToggle(i);
      });
    }
  };

  return (
    <div className="shrink-0 border-b border-border/60 bg-elevated/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Select-all toggle */}
        <div className="flex items-center gap-1 pr-1.5 border-r border-border/60">
          <HunkCheckbox
            checked={allStaged}
            indeterminate={!allStaged && !noneStaged}
            onClick={toggleAll}
          />
          <span className="text-[10px] text-fg-subtle">
            {stagedIndices.size}/{changes.length}
          </span>
        </div>

        {/* Per-hunk pills */}
        {changes.map((c, i) => {
          const staged = stagedIndices.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggle(i)}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                'focus-visible:outline-none',
                staged
                  ? 'bg-elevated text-fg hover:bg-elevated-2'
                  : 'bg-transparent text-fg-subtle hover:bg-elevated',
              )}
            >
              <HunkCheckbox checked={staged} onClick={() => onToggle(i)} />
              <span className={cn('font-mono', staged ? 'text-fg-muted' : 'text-fg-subtle/60')}>
                {hunkRange(c)}
              </span>
              <span className={cn(
                'font-mono',
                staged
                  ? c.modifiedEndLineNumber === 0 ? 'text-red-400' : 'text-emerald-400'
                  : 'text-fg-subtle/60',
              )}>
                {hunkLabel(c)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
