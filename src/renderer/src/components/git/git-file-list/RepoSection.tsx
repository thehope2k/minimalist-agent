import { Check, ChevronDown, ChevronRight, FolderGit2, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitFileEntry, GitRepo } from '../types';
import { ChangedFileRow } from './ChangedFileRow';
import { repoLabel, shortenRoot } from './shared';

interface RepoSectionProps {
  repo: GitRepo;
  repoIndex: number;
  branch: string | null;
  collapsed: boolean;
  selected: GitFileEntry | null;
  stagedPaths: Set<string>;
  hunkStates?: Map<string, { staged: number; total: number }>;
  onToggleCollapsed: () => void;
  onSelect: (file: GitFileEntry) => void;
  onToggleStage: (file: GitFileEntry) => void;
  onToggleRepoStage: (repo: GitRepo) => void;
}

export function RepoSection({
  repo,
  repoIndex,
  branch,
  collapsed,
  selected,
  stagedPaths,
  hunkStates,
  onToggleCollapsed,
  onSelect,
  onToggleStage,
  onToggleRepoStage,
}: RepoSectionProps) {
  const sortedFiles = [
    ...repo.files.filter((file) => file.status === 'U'),
    ...repo.files.filter((file) => file.status !== 'U'),
  ];
  const allStaged = repo.files.every((file) => stagedPaths.has(file.absolutePath));
  const someStaged = repo.files.some((file) => stagedPaths.has(file.absolutePath));
  const indeterminate = someStaged && !allStaged;

  return (
    <div>
      <div
        className={cn(
          'sticky top-0 z-10 flex cursor-pointer items-center gap-2 bg-app px-3 py-2.5',
          repoIndex > 0 && 'border-t border-border',
        )}
        title={repo.root}
        onClick={onToggleCollapsed}
      >
        <div
          role="checkbox"
          aria-checked={indeterminate ? 'mixed' : allStaged}
          aria-label={allStaged ? 'Unstage all files in repo' : 'Stage all files in repo'}
          onClick={(event) => { event.stopPropagation(); onToggleRepoStage(repo); }}
          className={cn(
            'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors',
            allStaged || indeterminate
              ? 'border-accent bg-accent'
              : 'border-border-strong bg-transparent hover:border-accent/70',
          )}
        >
          {indeterminate
            ? <Minus className="h-3 w-3 text-accent-fg" strokeWidth={3} />
            : allStaged
              ? <Check className="h-3 w-3 text-accent-fg" strokeWidth={2.5} />
              : null}
        </div>
        {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />}
        <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-fg">{repoLabel(repo.root)}</span>
            {branch && <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{branch}</span>}
          </div>
          <span className="block truncate font-mono text-[11px] text-fg-subtle">{shortenRoot(repo.root)}</span>
        </div>
        <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">{repo.files.length}</span>
      </div>
      {!collapsed && sortedFiles.map((file) => (
        <ChangedFileRow
          key={file.absolutePath}
          file={file}
          selected={selected?.absolutePath === file.absolutePath}
          staged={stagedPaths.has(file.absolutePath)}
          hunkState={hunkStates?.get(file.absolutePath)}
          onSelect={onSelect}
          onToggleStage={onToggleStage}
        />
      ))}
    </div>
  );
}
