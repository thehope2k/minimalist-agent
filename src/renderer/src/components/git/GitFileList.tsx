// Left panel of the git diff modal: repo groups with file lists.
// Keyboard navigable (↑↓), click to select, status badges + colored filenames.
//
// A (staged-new) and ? (untracked) are both shown as N (new/uncommitted).
// The staged vs unstaged distinction is a git internal — irrelevant for
// "what changed" review.

import { useEffect, useRef } from 'react';
import { FolderGit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitFileEntry, GitFileStatus, GitRepo } from './types';

interface GitFileListProps {
  repos: GitRepo[];
  selected: GitFileEntry | null;
  onSelect: (file: GitFileEntry) => void;
}

const STATUS_STYLES: Record<GitFileStatus, {
  label: string;
  badgeClasses: string;
  /** Color applied to the filename — consistent with DiffPart's add/remove palette. */
  nameClasses: string;
}> = {
  M: {
    label: 'M',
    badgeClasses: 'text-amber-400 bg-amber-500/15',
    nameClasses: 'text-amber-300',
  },
  A: {
    label: 'N',
    badgeClasses: 'text-emerald-400 bg-emerald-500/15',
    nameClasses: 'text-emerald-300',
  },
  D: {
    label: 'D',
    badgeClasses: 'text-red-400 bg-red-500/15',
    nameClasses: 'text-red-300 line-through',
  },
  R: {
    label: 'R',
    badgeClasses: 'text-blue-400 bg-blue-500/15',
    nameClasses: 'text-blue-300',
  },
  '?': {
    label: 'N',
    badgeClasses: 'text-emerald-400 bg-emerald-500/15',
    nameClasses: 'text-emerald-300',
  },
};

function repoLabel(root: string): string {
  return root.split('/').filter(Boolean).pop() ?? root;
}

function shortenRoot(root: string): string {
  return root.replace(/^\/Users\/[^/]+\//, '~/');
}

function splitPath(relativePath: string): { dir: string; name: string } {
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastSlash === -1) return { dir: '', name: relativePath };
  return {
    dir: relativePath.slice(0, lastSlash + 1),
    name: relativePath.slice(lastSlash + 1),
  };
}

export function GitFileList({ repos, selected, onSelect }: GitFileListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const allFiles = repos.flatMap((r) => r.files);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const idx = selected
        ? allFiles.findIndex((f) => f.absolutePath === selected.absolutePath)
        : -1;
      const next =
        e.key === 'ArrowDown'
          ? Math.min(allFiles.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      if (allFiles[next]) onSelect(allFiles[next]);
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [allFiles, selected, onSelect]);

  if (repos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-center text-xs text-fg-subtle">No uncommitted changes</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="scroll-thin flex h-full flex-col overflow-y-auto outline-none"
    >
      {repos.map((repo, repoIdx) => (
        <div key={repo.root}>
          {/* ── Repo section header ── */}
          <div
            className={cn(
              'sticky top-0 z-10 flex items-center gap-2 bg-app px-3 py-2.5',
              repoIdx > 0 && 'border-t border-border',
            )}
            title={repo.root}
          >
            <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-fg">
                {repoLabel(repo.root)}
              </span>
              <span className="block truncate font-mono text-[10px] text-fg-subtle">
                {shortenRoot(repo.root)}
              </span>
            </div>
            <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">
              {repo.files.length}
            </span>
          </div>

          {/* ── File rows — indented under the repo header ── */}
          {repo.files.map((file) => {
            const isSelected = selected?.absolutePath === file.absolutePath;
            const s = STATUS_STYLES[file.status];
            const { dir, name } = splitPath(file.relativePath);
            return (
              <button
                key={file.absolutePath}
                type="button"
                onClick={() => onSelect(file)}
                className={cn(
                  'flex w-full items-center gap-2 py-1.5 pr-3 text-left transition-colors',
                  'focus-visible:outline-none',
                  isSelected
                    ? 'border-l-2 border-accent bg-accent/10 pl-[26px]'
                    : 'border-l-2 border-transparent pl-[26px] hover:bg-elevated',
                )}
              >
                {/* Status badge */}
                <span
                  className={cn(
                    'shrink-0 rounded px-1 py-0.5 font-mono text-[10px] font-bold leading-none',
                    s.badgeClasses,
                  )}
                >
                  {s.label}
                </span>

                {/* Filename (status-colored) + directory (muted) */}
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate font-mono text-[12px] font-medium', s.nameClasses)}>
                    {name}
                  </span>
                  {dir && (
                    <span className="block truncate font-mono text-[10px] text-fg-subtle">
                      {dir}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
