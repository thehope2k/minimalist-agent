import { GitCommitHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AmendPreview } from '../CommitPanel';
import { STATUS_STYLES, splitPath } from './shared';

interface AmendPreviewSectionProps {
  amendPreview: AmendPreview;
  hasRepos: boolean;
  selectedPath?: string;
  onSelect?: (file: AmendPreview['files'][number]) => void;
}

export function AmendPreviewSection({
  amendPreview,
  hasRepos,
  selectedPath,
  onSelect,
}: AmendPreviewSectionProps) {
  return (
    <div>
      <div
        className={cn(
          'sticky top-0 z-10 flex items-center gap-2 bg-app px-3 py-2.5',
          hasRepos && 'border-t border-border',
        )}
        title="This commit will be amended with the staged changes above"
      >
        <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-fg-subtle">
            {amendPreview.subject ?? 'Commit being amended'}
          </span>
        </div>
        <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-fg-subtle">
          {amendPreview.files.length}
        </span>
      </div>
      {amendPreview.files.map((file, index) => {
        const { dir, name } = splitPath(file.path);
        const styles = STATUS_STYLES[file.status];
        return (
          <button
            key={`${file.path}-${index}`}
            type="button"
            onClick={() => onSelect?.(file)}
            className={cn(
              'flex w-full items-center gap-2.5 py-2 pr-3 text-left transition-colors focus-visible:outline-none',
              selectedPath === file.path
                ? 'border-l-2 border-accent bg-accent/10 pl-[26px]'
                : 'border-l-2 border-transparent pl-[26px] hover:bg-elevated',
            )}
          >
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none', styles.badgeClasses)}>
              {styles.label}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate font-mono text-[13px] font-medium', styles.nameClasses)}>
                {file.oldPath ? `${file.oldPath.split('/').pop()} → ${name}` : name}
              </span>
              {dir && <span className="block truncate font-mono text-[11px] text-fg-subtle">{dir}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
