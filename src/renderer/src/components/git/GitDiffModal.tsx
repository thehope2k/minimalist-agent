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
import { ExpandModal } from '@/components/ui';
import { GitDiffView } from './GitDiffView';
import { ConflictView } from './ConflictView';
import { MergeStateBanner } from './MergeStateBanner';
import { applySelectedHunks } from './git-util';
import { buildDiffContext } from './git-generate';
import {
  buildHunkStates,
  toggleFileStage,
  toggleHunkStage,
  toggleRepoStage,
} from './staging-state';
import { buildRestorePlan, hunkKey, type PersistedGitReviewState } from './git-review-state';
import { GitHeader } from './git-flow/GitHeader';
import { GitLeftPanel } from './git-flow/GitLeftPanel';
import { useGitReviewPersistence } from './git-flow/useGitReviewPersistence';
import { useMergeState } from './conflict-flow/useMergeState';
import { useConflictResolution } from './conflict-flow/useConflictResolution';
import type { GitFileEntry, GitFileDiff, GitRepo, LineChange } from './types';

interface GitDiffModalProps {
  cwd: string | null;
  onClose: () => void;
  connectionSlug?: string;
  model?: string;
  /** Active session id — required for Copilot/Pi commit message generation. */
  sessionId?: string;
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

  // ── Merge / conflict state ───────────────────────────────────────────────
  const repoRoots = useMemo(() => repos.map((r) => r.root), [repos]);
  const { mergeStates, inMergeOperation, totalConflicts, refresh: refreshMergeState } =
    useMergeState({ repoRoots, enabled: !statusLoading && repos.length > 0 });

  // Active merge is the first repo that is in a non-idle operation.
  const activeMergeEntry = useMemo(() => {
    for (const [root, state] of mergeStates) {
      if (state.type !== 'none') return { root, state };
    }
    return null;
  }, [mergeStates]);

  // Stable ref so useConflictResolution.onDone always calls the latest loadStatus.
  const loadStatusRef = useRef<() => void>(() => {});

  const { aborting, continuing, actionError, abort, continueMerge, clearError } =
    useConflictResolution({
      onDone: () => {
        loadStatusRef.current();
      },
    });

  const pendingHunkRestoreRef = useRef<Map<string, Set<string>>>(new Map());
  const restoredPartialContentRef = useRef<Map<string, string>>(new Map());
  // Paths that have pending hunk restore (diff not yet loaded) — tracked in state
  // so hunkStates can show indeterminate rather than fully-checked while waiting.
  const [pendingPartialPaths, setPendingPartialPaths] = useState<Set<string>>(new Set());

  const applyRestoreSnapshot = useCallback((snapshot: PersistedGitReviewState, repoList: GitRepo[]) => {
    const allFiles = repoList.flatMap((r) => r.files);
    const plan = buildRestorePlan(snapshot, allFiles);

    pendingHunkRestoreRef.current = plan.pendingHunkKeys;
    restoredPartialContentRef.current = plan.partialContents;
    setPendingPartialPaths(new Set(plan.pendingHunkKeys.keys()));
    setStagedPaths(plan.stagedPaths);
    setStagedHunks(plan.stagedHunks);
    setSelected((prev) => {
      if (plan.selectedPath) {
        const found = allFiles.find((f) => f.absolutePath === plan.selectedPath);
        if (found) return found;
      }
      return prev ?? allFiles[0] ?? null;
    });
  }, []);

  const {
    onNoCwd,
    prepareForRepos,
    clearPersisted,
  } = useGitReviewPersistence({
    cwd,
    repos,
    statusLoading,
    committing,
    selected,
    stagedPaths,
    stagedHunks,
    lineChangesByPath: lineChangesCacheRef.current,
    partialContentByPath: useMemo(() => {
      const map = new Map<string, string>();
      for (const [path, hs] of stagedHunks) {
        if (hs.size === 0) continue;
        const fileDiff = diffCacheRef.current.get(path);
        const fileChanges = lineChangesCacheRef.current.get(path) ?? [];
        if (!fileDiff || hs.size >= fileChanges.length) continue;
        map.set(path, applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, hs));
      }
      return map;
    }, [stagedHunks]),
    onApplySnapshot: applyRestoreSnapshot,
    pendingHunkKeysRef: pendingHunkRestoreRef,
  });

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    if (!cwd) {
      setStatusError('no_cwd');
      onNoCwd();
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
      setSelected((prev) => {
        if (!prev) return allFiles[0] ?? null;
        return allFiles.find((f) => f.absolutePath === prev.absolutePath) ?? (allFiles[0] ?? null);
      });
      setStagedPaths(new Set());
      setStagedHunks(new Map());
      setCurrentChanges([]);
      setPendingPartialPaths(new Set());
      diffCacheRef.current.clear();
      lineChangesCacheRef.current.clear();
      pendingHunkRestoreRef.current.clear();
      restoredPartialContentRef.current.clear();

      // Apply persisted state last so it is not overwritten by default init.
      await prepareForRepos(newRepos);
    } finally {
      setStatusLoading(false);
    }
  }, [cwd, onNoCwd, prepareForRepos]);

  // Called when ConflictView successfully resolves a file (git add done).
  const handleConflictResolved = useCallback(() => {
    refreshMergeState();
    void loadStatus();
  }, [refreshMergeState, loadStatus]);

  // Keep the stable ref in sync.
  loadStatusRef.current = loadStatus;

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
    const path = selected.absolutePath;
    lineChangesCacheRef.current.set(path, changes);

    const pending = pendingHunkRestoreRef.current.get(path);
    if (pending) {
      const selectedIndices = new Set<number>();
      changes.forEach((c, i) => {
        if (pending.has(hunkKey(c))) selectedIndices.add(i);
      });
      pendingHunkRestoreRef.current.delete(path);
      setPendingPartialPaths((prev) => { const n = new Set(prev); n.delete(path); return n; });

      setStagedPaths((prev) => {
        const n = new Set(prev);
        if (selectedIndices.size > 0) n.add(path);
        else n.delete(path);
        return n;
      });
      setStagedHunks((prev) => {
        const next = new Map(prev);
        if (selectedIndices.size === 0) next.set(path, new Set());
        else if (selectedIndices.size === changes.length) next.delete(path);
        else next.set(path, selectedIndices);
        return next;
      });
      if (selectedIndices.size === changes.length) restoredPartialContentRef.current.delete(path);
      return;
    }

    // Initialize hunk staging for this file if not already set.
    setStagedHunks((prev) => {
      if (prev.has(path)) return prev;
      const next = new Map(prev);
      if (stagedPaths.has(path)) next.set(path, new Set(changes.map((_, i) => i)));
      else next.set(path, new Set());
      return next;
    });
  }, [selected, stagedPaths]);

  const handleToggleHunk = useCallback((index: number) => {
    if (!selected) return;
    const next = toggleHunkStage(
      { stagedPaths, stagedHunks },
      selected.absolutePath,
      index,
      currentChanges.length,
    );
    setStagedPaths(next.stagedPaths);
    setStagedHunks(next.stagedHunks);

    const path = selected.absolutePath;
    const hs = next.stagedHunks.get(path);
    if (!hs || hs.size === 0 || hs.size >= currentChanges.length) {
      restoredPartialContentRef.current.delete(path);
    }
  }, [selected, currentChanges.length, stagedPaths, stagedHunks]);

  const handleToggleStage = useCallback((file: GitFileEntry) => {
    const next = toggleFileStage({ stagedPaths, stagedHunks }, file);
    setStagedPaths(next.stagedPaths);
    setStagedHunks(next.stagedHunks);

    if (!next.stagedPaths.has(file.absolutePath) || !next.stagedHunks.has(file.absolutePath)) {
      restoredPartialContentRef.current.delete(file.absolutePath);
    }
  }, [stagedPaths, stagedHunks]);

  const handleToggleRepoStage = useCallback((repo: GitRepo) => {
    const next = toggleRepoStage({ stagedPaths, stagedHunks }, repo);
    setStagedPaths(next.stagedPaths);
    setStagedHunks(next.stagedHunks);

    for (const f of repo.files) {
      if (!next.stagedPaths.has(f.absolutePath) || !next.stagedHunks.has(f.absolutePath)) {
        restoredPartialContentRef.current.delete(f.absolutePath);
      }
    }
  }, [stagedPaths, stagedHunks]);

  // Derive hunk state map for file list indeterminate display.
  const hunkStates = useMemo(() => {
    const hunkTotalsByPath = new Map<string, number>();
    for (const [path, changes] of lineChangesCacheRef.current) {
      hunkTotalsByPath.set(path, changes.length);
    }
    const map = buildHunkStates(stagedPaths, stagedHunks, hunkTotalsByPath);
    // Files with a pending hunk restore haven't had their diff loaded yet, so
    // buildHunkStates has no total count and omits them from the map — causing the
    // file list to fall back to isFullyStaged=true. Inject an indeterminate
    // placeholder so the checkbox correctly shows ⊟ until Monaco resolves the hunks.
    for (const path of pendingPartialPaths) {
      if (!map.has(path)) map.set(path, { staged: 1, total: 2 });
    }
    return map;
  }, [stagedPaths, stagedHunks, pendingPartialPaths]);


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

            // No hunk state means "all hunks staged" for this file.
            if (!hs) {
              return {
                relativePath: f.relativePath,
                absolutePath: f.absolutePath,
                status: f.status,
                content: undefined,
              };
            }

            const fileDiff = diffCacheRef.current.get(f.absolutePath);
            const fileChanges = lineChangesCacheRef.current.get(f.absolutePath) ?? [];
            const allStaged = hs.size >= fileChanges.length;

            const restoredPartial = restoredPartialContentRef.current.get(f.absolutePath);
            const content = allStaged
              ? undefined
              : fileDiff
                ? applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, hs)
                : restoredPartial;

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
      restoredPartialContentRef.current.clear();
      clearPersisted();
      await loadStatus();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [repos, stagedPaths, stagedHunks, loadStatus, clearPersisted]);

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
  const selectedHunks = selected
    ? (stagedPaths.has(selected.absolutePath)
      ? (stagedHunks.get(selected.absolutePath) ?? null)
      : new Set<number>())
    : null;

  // Repo folder names with at least one staged file — shown in commit panel.
  const stagedRepos = repos
    .filter((r) => r.files.some((f) => stagedPaths.has(f.absolutePath)))
    .map((r) => r.root.split('/').filter(Boolean).pop() ?? r.root);

  const fullTitle = (
    <GitHeader
      cwd={cwd}
      totalFiles={totalFiles}
      splitView={splitView}
      onToggleSplit={() => setSplitView((v) => !v)}
      mergeType={activeMergeEntry?.state.type}
      conflictCount={totalConflicts}
    />
  );

  return (
    <ExpandModal title={fullTitle} onClose={onClose} className="w-[95vw] h-[90vh]">
      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border/60 bg-panel">
          {/* Merge state banner — shown when any repo is in a merge operation */}
          {activeMergeEntry && (
            <MergeStateBanner
              type={activeMergeEntry.state.type}
              headLabel={activeMergeEntry.state.headLabel}
              incomingLabel={activeMergeEntry.state.incomingLabel}
              mergeMessage={activeMergeEntry.state.mergeMessage}
              conflictCount={activeMergeEntry.state.conflictCount}
              rebaseProgress={activeMergeEntry.state.rebaseProgress}
              aborting={aborting}
              continuing={continuing}
              error={actionError}
              onAbort={() => void abort(activeMergeEntry.root, activeMergeEntry.state.type)}
              onContinue={() =>
                void continueMerge(
                  activeMergeEntry.root,
                  activeMergeEntry.state.mergeMessage ?? 'Merge commit',
                  activeMergeEntry.state.type,
                )
              }
              onClearError={clearError}
            />
          )}
          <GitLeftPanel
            statusLoading={statusLoading}
            statusError={statusError}
            repos={repos}
            selected={selected}
            onSelect={setSelected}
            stagedPaths={stagedPaths}
            onToggleStage={handleToggleStage}
            onToggleRepoStage={handleToggleRepoStage}
            hunkStates={hunkStates}
            stagedCount={stagedPaths.size}
            totalCount={totalFiles}
            stagedRepos={stagedRepos}
            onCommit={handleCommit}
            onFetchLastMessage={handleFetchLastMessage}
            onGenerateMessage={handleGenerateMessage}
            committing={committing}
            error={commitError}
          />
        </div>

        {/* Right panel: conflict view OR Monaco diff + hunk panel */}
        <div className="flex min-w-0 flex-1 flex-col bg-panel">
          {selected?.status === 'U' ? (
            <ConflictView
              key={selected.absolutePath}
              file={selected}
              onResolved={handleConflictResolved}
            />
          ) : (
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
          )}
        </div>
      </div>
    </ExpandModal>
  );
}
