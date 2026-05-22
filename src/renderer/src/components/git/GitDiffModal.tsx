// Git diff review modal — opened with Cmd+G.
//
// Layout: ExpandModal (full-width) with a two-column body:
//   left  ~256 px  GitFileList  (repo groups + file rows)
//   right flex-1   GitDiffView  (Monaco DiffEditor)
//
// Data flow:
//   1. On open → git:status(cwd) → populate left panel, auto-select first file
//   2. On file select → git:diff(file) → update right panel
//      Previous diff stays visible while new one loads (no flash).

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Columns2, AlignLeft } from 'lucide-react';
import { ExpandModal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { GitFileList } from './GitFileList';
import { GitDiffView } from './GitDiffView';
import type { GitFileEntry, GitFileDiff, GitRepo } from './types';

interface GitDiffModalProps {
  cwd: string | null;
  onClose: () => void;
}

function shortenCwd(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, '~/');
}

export function GitDiffModal({ cwd, onClose }: GitDiffModalProps) {
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [selected, setSelected] = useState<GitFileEntry | null>(null);
  // `diff` holds the last successfully loaded diff — kept visible while a
  // new one is in-flight so there's no blank flash between file selections.
  const [diff, setDiff] = useState<GitFileDiff | null>(null);

  const [splitView, setSplitView] = useState(true);

  const loadStatus = useCallback(async () => {
    if (!cwd) {
      setStatusError('no_cwd');
      setStatusLoading(false);
      return;
    }
    setStatusError(null);
    try {
      const result = await window.api.git.status(cwd);
      setRepos(result.repos as GitRepo[]);
      if (result.error === 'no_git_repos') {
        setStatusError('no_git_repos');
      } else if (result.error) {
        setStatusError(result.error);
      }
      // Auto-select first file on initial load.
      const first = result.repos[0]?.files[0] ?? null;
      setSelected((prev) => prev ?? (first as GitFileEntry | null));
    } finally {
      setStatusLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // Load diff when selection changes. Previous diff stays visible until
  // the new one arrives — avoids the jarring full-panel spinner flash.
  useEffect(() => {
    if (!selected) { setDiff(null); return; }
    let cancelled = false;
    window.api.git
      .diff({
        repoRoot: selected.repoRoot,
        relativePath: selected.relativePath,
        absolutePath: selected.absolutePath,
        status: selected.status,
      })
      .then((result) => {
        if (!cancelled) setDiff(result as GitFileDiff);
      })
      .catch(() => { if (!cancelled) setDiff(null); });
    return () => { cancelled = true; };
  }, [selected]);

  const totalFiles = repos.reduce((n, r) => n + r.files.length, 0);

  const title = (
    <>
      <GitBranch className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
      <span className="text-sm font-medium text-fg">Git Changes</span>
      {totalFiles > 0 && (
        <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">
          {totalFiles}
        </span>
      )}
      <span className="text-fg-subtle">·</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
        {cwd ? shortenCwd(cwd) : 'No working directory'}
      </span>
    </>
  );

  const headerActions = (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => setSplitView((v) => !v)}
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
  );

  const fullTitle = (
    <div className="flex w-full items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
      {headerActions}
    </div>
  );

  return (
    <ExpandModal
      title={fullTitle}
      onClose={onClose}
      className="w-[95vw] h-[90vh]"
    >
      <div className="flex min-h-0 flex-1">
        {/* Left panel — file list */}
        <div className="w-64 shrink-0 border-r border-border/60 bg-panel">
          {statusLoading && !repos.length ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-xs text-fg-subtle">Loading…</span>
            </div>
          ) : statusError === 'no_cwd' ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-center text-xs text-fg-subtle">
                Set a working directory for this session to use git review
              </p>
            </div>
          ) : statusError === 'no_git_repos' ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-center text-xs text-fg-subtle">
                No git repositories found in this directory
              </p>
            </div>
          ) : statusError ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-center text-xs text-red-400">{statusError}</p>
            </div>
          ) : (
            <GitFileList repos={repos} selected={selected} onSelect={setSelected} />
          )}
        </div>

        {/* Right panel — diff viewer */}
        <div className="min-w-0 flex-1 bg-panel">
          <GitDiffView diff={diff} splitView={splitView} />
        </div>
      </div>
    </ExpandModal>
  );
}
