// Git diff review + commit modal — opened with Cmd+G.
//
// Layout: ExpandModal with a two-column body:
//   left  ~256 px  GitFileList (file list with stage checkboxes, indeterminate for partial)
//                  CommitPanel (message + commit button, pinned bottom)
//   right flex-1   HunkPanel (per-hunk checkboxes, above Monaco)
//                  GitDiffView (Monaco DiffEditor, readonly)
//
// Staging model:
//   - All files checked by default; uncheck a file to exclude it entirely.
//   - Each diff hunk has its own checkbox (via HunkPanel). Unchecked hunks
//     are reverted to original content in the committed version only —
//     the disk file is never touched.
//   - File checkbox shows indeterminate (⊟) when only some hunks are staged.
//   - File checkbox click: checked → unchecked; indeterminate/unchecked → all hunks staged.
//   - On commit: for each staged file, reconstruct commit content from
//     staged hunks via applySelectedHunks(); use git hash-object + update-index.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Columns2, AlignLeft } from 'lucide-react';
import { ExpandModal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { GitFileList } from './GitFileList';
import { GitDiffView } from './GitDiffView';
import { CommitPanel } from './CommitPanel';
import { applySelectedHunks } from './git-util';
import { buildDiffContext } from './git-generate';
import type { GitFileEntry, GitFileDiff, GitRepo, LineChange } from './types';

interface GitDiffModalProps {
  cwd: string | null;
  onClose: () => void;
  connectionSlug?: string;
  model?: string;
  /** Active session id — required for Copilot/Pi commit message generation. */
  sessionId?: string;
}

function shortenCwd(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, '~/');
}

export function GitDiffModal({ cwd, onClose, connectionSlug, model, sessionId }: GitDiffModalProps) {
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [selected, setSelected] = useState<GitFileEntry | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  // Cache diff data per file so partial-hunk commits work correctly for
  // all staged files, not just the currently visible one.
  const diffCacheRef = useRef<Map<string, GitFileDiff>>(new Map());

  // File-level staging: all files staged by default.
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(new Set());

  // Hunk-level staging per file. Key = absolutePath, value = Set of staged hunk indices.
  // Files not in this map → treat all hunks as staged (use full disk file for commit).
  const [stagedHunks, setStagedHunks] = useState<Map<string, Set<number>>>(new Map());

  // Raw line changes for the currently selected file (from Monaco).
  const [currentChanges, setCurrentChanges] = useState<LineChange[]>([]);
  // Per-file line change cache, populated by onDiffComputed.
  const lineChangesCacheRef = useRef<Map<string, LineChange[]>>(new Map());

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
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
      const newRepos = result.repos as GitRepo[];
      setRepos(newRepos);
      if (result.error === 'no_git_repos') setStatusError('no_git_repos');
      else if (result.error) setStatusError(result.error);
      const allFiles = newRepos.flatMap((r) => r.files);
      setSelected((prev) => prev ?? (allFiles[0] ?? null));
      setStagedPaths(new Set(allFiles.map((f) => f.absolutePath)));
      setStagedHunks(new Map());
      setCurrentChanges([]);
    } finally {
      setStatusLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // Load diff when selection changes.
  useEffect(() => {
    if (!selected) { setDiff(null); setCurrentChanges([]); return; }
    let cancelled = false;
    setCurrentChanges([]); // clear stale hunk panel while loading
    window.api.git
      .diff({
        repoRoot: selected.repoRoot,
        relativePath: selected.relativePath,
        absolutePath: selected.absolutePath,
        status: selected.status,
      })
      .then((result) => {
        if (!cancelled) {
          const fileDiff = result as GitFileDiff;
          setDiff(fileDiff);
          // Cache for use at commit time — ensures partial-hunk content is
          // correct even if the user commits without re-selecting the file.
          diffCacheRef.current.set(selected.absolutePath, fileDiff);
        }
      })
      .catch(() => { if (!cancelled) setDiff(null); });
    return () => { cancelled = true; };
  }, [selected]);

  // Monaco fires this after computing the diff for the selected file.
  const handleDiffComputed = useCallback((changes: LineChange[]) => {
    setCurrentChanges(changes);
    if (!selected) return;
    lineChangesCacheRef.current.set(selected.absolutePath, changes);
    // Initialize hunk staging for this file if not already set.
    setStagedHunks((prev) => {
      if (prev.has(selected.absolutePath)) return prev;
      const next = new Map(prev);
      next.set(selected.absolutePath, new Set(changes.map((_, i) => i)));
      return next;
    });
  }, [selected]);

  const handleToggleHunk = useCallback((index: number) => {
    if (!selected) return;
    setStagedHunks((prev) => {
      const current = prev.get(selected.absolutePath)
        ?? new Set(currentChanges.map((_, i) => i));
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return new Map(prev).set(selected.absolutePath, next);
    });
  }, [selected, currentChanges]);

  const handleToggleStage = useCallback((file: GitFileEntry) => {
    const hs = stagedHunks.get(file.absolutePath);
    const isFullyStaged = stagedPaths.has(file.absolutePath) &&
      (!hs || hs.size === currentChanges.length);
    const isPartial = stagedPaths.has(file.absolutePath) &&
      hs != null && hs.size > 0 && hs.size < currentChanges.length;

    if (isFullyStaged || isPartial) {
      // Any staged state → fully unstage: remove from paths AND empty hunks.
      setStagedPaths((prev) => { const n = new Set(prev); n.delete(file.absolutePath); return n; });
      setStagedHunks((prev) => new Map(prev).set(file.absolutePath, new Set()));
    } else {
      // Unstaged → stage all: add to paths AND clear hunk entry (undefined = all staged).
      setStagedPaths((prev) => new Set(prev).add(file.absolutePath));
      setStagedHunks((prev) => { const n = new Map(prev); n.delete(file.absolutePath); return n; });
    }
  }, [stagedPaths, stagedHunks, currentChanges.length]);

  // Derive hunk state map for file list indeterminate display.
  const hunkStates = useMemo(() => {
    const map = new Map<string, { staged: number; total: number }>();
    for (const [path, indices] of stagedHunks) {
      // total = max index + 1 (indices are 0-based and contiguous)
      const total = indices.size > 0 ? Math.max(...indices) + 1 : 0;
      map.set(path, { staged: indices.size, total });
    }
    return map;
  }, [stagedHunks]);

  const handleCommit = useCallback(async (message: string, amend: boolean) => {
    setCommitting(true);
    setCommitError(null);
    try {
      const byRepo = new Map<string, GitFileEntry[]>();
      for (const repo of repos) {
        const staged = repo.files.filter((f) => stagedPaths.has(f.absolutePath));
        if (staged.length > 0) byRepo.set(repo.root, staged);
      }
      for (const [repoRoot, files] of byRepo) {
        const result = await window.api.git.commitFiles({
          repoRoot,
          message,
          amend,
          files: files.map((f) => {
            const hs = stagedHunks.get(f.absolutePath);
            // If no hunk data or all hunks staged → commit full disk file (content undefined).
            const hunkData = stagedHunks.get(f.absolutePath);
            const allStagedOrUnknown = !hunkData || (diff && f.absolutePath === selected?.absolutePath
              ? hunkData.size >= currentChanges.length
              : true);
            const content = allStagedOrUnknown || !diff
              ? undefined
              : applySelectedHunks(diff.original, diff.modified, currentChanges, hs ?? new Set());
            return {
              relativePath: f.relativePath,
              absolutePath: f.absolutePath,
              status: f.status,
              content,
            };
          }),
        });
        if (!result.ok) throw new Error(result.error ?? 'Commit failed');
      }
      setStagedHunks(new Map());
      setCurrentChanges([]);
      await loadStatus();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [repos, stagedPaths, stagedHunks, diff, selected, currentChanges, loadStatus]);

  const handleGenerateMessage = useCallback(async (amend: boolean) => {
    if (!cwd) return null;
    const allFiles = repos.flatMap((r) => r.files);
    const staged = allFiles.filter((f) => stagedPaths.has(f.absolutePath));
    if (staged.length === 0) return null;

    // Resolve connection.
    let slug = connectionSlug;
    let mdl = model;
    if (!slug) {
      const [defaultSlug, connections] = await Promise.all([
        window.api.connections.getDefaultSlug(),
        window.api.connections.list(),
      ]);
      const conn = connections.find((c) => c.slug === defaultSlug) ?? connections[0];
      if (!conn) return null;
      slug = conn.slug;
      mdl = mdl ?? conn.defaultModel;
    }

    const diffContext = await buildDiffContext({ repos, staged, cwd, amend });

    return window.api.git.generateCommitMessage({
      connectionSlug: slug,
      model: mdl ?? undefined,
      diffContext,
      sessionId: sessionId ?? undefined,
      cwd,
    });
  }, [repos, stagedPaths, cwd, connectionSlug, model, sessionId]);

  const handleFetchLastMessage = useCallback(async () => {
    const repoRoot =
      repos.find((r) => r.files.some((f) => stagedPaths.has(f.absolutePath)))?.root
      ?? repos[0]?.root
      ?? cwd;
    if (!repoRoot) return null;
    return window.api.git.lastCommitMessage(repoRoot);
  }, [repos, stagedPaths, cwd]);

  const totalFiles = repos.reduce((n, r) => n + r.files.length, 0);
  const selectedHunks = selected ? (stagedHunks.get(selected.absolutePath) ?? null) : null;

  // Repo folder names with at least one staged file — shown in commit panel.
  const stagedRepos = repos
    .filter((r) => r.files.some((f) => stagedPaths.has(f.absolutePath)))
    .map((r) => r.root.split('/').filter(Boolean).pop() ?? r.root);

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

  const leftPanelContent = () => {
    if (statusLoading && !repos.length) return <div className="flex h-full items-center justify-center"><span className="text-xs text-fg-subtle">Loading…</span></div>;
    if (statusError === 'no_cwd') return <div className="flex h-full items-center justify-center p-6"><p className="text-center text-xs text-fg-subtle">Set a working directory for this session to use git review</p></div>;
    if (statusError === 'no_git_repos') return <div className="flex h-full items-center justify-center p-6"><p className="text-center text-xs text-fg-subtle">No git repositories found in this directory</p></div>;
    if (statusError) return <div className="flex h-full items-center justify-center p-6"><p className="text-center text-xs text-red-400">{statusError}</p></div>;
    return (
      <>
        <div className="min-h-0 flex-1 overflow-hidden">
          <GitFileList
            repos={repos}
            selected={selected}
            onSelect={setSelected}
            stagedPaths={stagedPaths}
            onToggleStage={handleToggleStage}
            hunkStates={hunkStates}
          />
        </div>
        <CommitPanel
          stagedCount={stagedPaths.size}
          totalCount={totalFiles}
          stagedRepos={stagedRepos}
          onCommit={handleCommit}
          onFetchLastMessage={handleFetchLastMessage}
          onGenerateMessage={handleGenerateMessage}
          committing={committing}
          error={commitError}
        />
      </>
    );
  };

  return (
    <ExpandModal title={fullTitle} onClose={onClose} className="w-[95vw] h-[90vh]">
      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border/60 bg-panel">
          {leftPanelContent()}
        </div>

        {/* Right panel: Monaco with glyph margin hunk checkboxes */}
        <div className="flex min-w-0 flex-1 flex-col bg-panel">
          <div className="min-h-0 flex-1">
            <GitDiffView
              diff={diff}
              splitView={splitView}
              changes={currentChanges}
              stagedHunks={selectedHunks ?? undefined}
              onToggleHunk={handleToggleHunk}
              onDiffComputed={handleDiffComputed}
            />
          </div>
        </div>
      </div>
    </ExpandModal>
  );
}
