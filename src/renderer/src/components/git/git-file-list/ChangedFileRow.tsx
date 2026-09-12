import { AlertTriangle, Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitFileEntry } from '../types';
import { STATUS_STYLES, splitPath } from './shared';

interface ChangedFileRowProps {
  file: GitFileEntry;
  selected: boolean;
  staged: boolean;
  hunkState?: { staged: number; total: number };
  onSelect: (file: GitFileEntry) => void;
  onToggleStage: (file: GitFileEntry) => void;
}

export function ChangedFileRow({
  file,
  selected,
  staged,
  hunkState,
  onSelect,
  onToggleStage,
}: ChangedFileRowProps) {
  const isConflict = file.status === 'U';
  const isIndeterminate = staged && hunkState != null && hunkState.staged > 0 && hunkState.staged < hunkState.total;
  const isFullyStaged = staged && (!hunkState || hunkState.staged === hunkState.total);
  const styles = STATUS_STYLES[file.status];
  const { dir, name } = splitPath(file.relativePath);

  return (
    <button
      type="button"
      onClick={() => onSelect(file)}
      className={cn(
        'flex w-full items-center gap-2.5 py-2 pr-3 text-left transition-colors focus-visible:outline-none',
        selected
          ? 'border-l-2 border-accent bg-accent/10 pl-[26px]'
          : 'border-l-2 border-transparent pl-[26px] hover:bg-elevated',
      )}
    >
      {isConflict ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-orange-400" strokeWidth={1.75} aria-label="Conflict" />
      ) : (
        <div
          role="checkbox"
          aria-checked={isIndeterminate ? 'mixed' : isFullyStaged}
          aria-label={`Stage ${file.relativePath}`}
          onClick={(event) => { event.stopPropagation(); onToggleStage(file); }}
          className={cn(
            'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors',
            isFullyStaged || isIndeterminate
              ? 'border-accent bg-accent'
              : 'border-border-strong bg-transparent hover:border-accent/70',
          )}
        >
          {isIndeterminate
            ? <Minus className="h-3 w-3 text-accent-fg" strokeWidth={3} />
            : isFullyStaged
              ? <Check className="h-3 w-3 text-accent-fg" strokeWidth={2.5} />
              : null}
        </div>
      )}
      <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none', styles.badgeClasses)}>
        {styles.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-mono text-[13px] font-medium', styles.nameClasses)}>{name}</span>
        {dir && <span className="block truncate font-mono text-[11px] text-fg-subtle">{dir}</span>}
      </span>
    </button>
  );
}
