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

import { useCallback, useMemo, useRef, useState } from 'react';
import { ExpandModal } from '@/components/ui';
import { GitDiffView } from './GitDiffView';
import { ConflictView } from './ConflictView';
import { MergeStateBanner } from './MergeStateBanner';
import { buildRestorePlan, hunkKey } from './git-review-state';
import { GitHeader } from './git-flow/GitHeader';
import { GitLeftPanel } from './git-flow/GitLeftPanel';
import { useGitReviewPersistence } from './git-flow/useGitReviewPersistence';
import { useMergeState } from './conflict-flow/useMergeState';
import { useConflictResolution } from './conflict-flow/useConflictResolution';
import { useGitStatus } from './diff-modal/useGitStatus';
import { useFileSelection } from './diff-modal/useFileSelection';
import { useStagingState } from './diff-modal/useStagingState';
import { useCommitFlow } from './diff-modal/useCommitFlow';
import type { GitDiffModalProps, DiffCaches, PartialContentRefs } from './diff-modal/types';
import type { LineChange } from './types';

export function GitDiffModal({ cwd, onClose, connectionSlug, model, sessionId }: GitDiffModalProps) {
  const { repos, branchesByRepo, statusError, statusLoading, loadStatus } = useGitStatus(cwd);

  const [splitView, setSplitView] = useState(true);
  const [currentChanges, setCurrentChanges] = useState<LineChange[]>([]);

  // Caches for diffs and line changes
  const diffCacheRef = useRef<Map<string, any>>(new Map());
  const lineChangesCacheRef = useRef<Map<string, LineChange[]>>(new Map());
  const diffCaches: DiffCaches = {
    diffs: diffCacheRef.current,
    lineChanges: lineChangesCacheRef.current,
  };

  // Partial content refs for persistence/restore
  const pendingHunkRestoreRef = useRef<Map<string, Set<string>>>(new Map());
  const restoredPartialContentRef = useRef<Map<string, string>>(new Map());
  const partialContentRefs: PartialContentRefs = {
    pendingHunkKeys: pendingHunkRestoreRef.current,
    restoredPartialContent: restoredPartialContentRef.current,
  };

  const allFiles = useMemo(() => repos.flatMap((r) => r.files), [repos]);
  const { selected, setSelected, diff } = useFileSelection(allFiles, diffCaches);

  const {
    stagedPaths,
    setStagedPaths,
    stagedHunks,
    setStagedHunks,
    pendingPartialPaths,
    setPendingPartialPaths,
    handleToggleFile,
    handleToggleRepo,
    handleToggleHunk,
    hunkStates,
  } = useStagingState(lineChangesCacheRef, partialContentRefs);

  // ── Merge / conflict state ───────────────────────────────────────────────
  const repoRoots = useMemo(() => repos.map((r) => r.root), [repos]);
  const { mergeStates, totalConflicts, refresh: refreshMergeState } = useMergeState({
    repoRoots,
    enabled: !statusLoading && repos.length > 0,
  });

  const activeMergeEntry = useMemo(() => {
    for (const [root, state] of mergeStates) {
      if (state.type !== 'none') return { root, state };
    }
    return null;
  }, [mergeStates]);

  const loadStatusRef = useRef<() => void>(() => {});
  loadStatusRef.current = () => void loadStatus();

  const { aborting, continuing, actionError, abort, continueMerge, clearError } =
    useConflictResolution({
      onDone: () => loadStatusRef.current(),
    });

  const handleConflictResolved = useCallback(() => {
    refreshMergeState();
    void loadStatus();
  }, [refreshMergeState, loadStatus]);

  // ── Persistence ───────────────────────────────────────────────────────────
  const applyRestoreSnapshot = useCallback((snapshot: any, repoList: typeof repos) => {
    const allFilesList = repoList.flatMap((r) => r.files);
    const plan = buildRestorePlan(snapshot, allFilesList);

    pendingHunkRestoreRef.current = plan.pendingHunkKeys;
    restoredPartialContentRef.current = plan.partialContents;
    setPendingPartialPaths(new Set(plan.pendingHunkKeys.keys()));
    setStagedPaths(plan.stagedPaths);
    setStagedHunks(plan.stagedHunks);
    setSelected((prev) => {
      if (plan.selectedPath) {
        const found = allFilesList.find((f) => f.absolutePath === plan.selectedPath);
        if (found) return found;
      }
      return prev ?? allFilesList[0] ?? null;
    });
  }, [setStagedPaths, setStagedHunks, setPendingPartialPaths, setSelected]);

  const partialContentByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const [path, hs] of stagedHunks) {
      if (hs.size === 0) continue;
      const fileDiff = diffCacheRef.current.get(path);
      const fileChanges = lineChangesCacheRef.current.get(path) ?? [];
      if (!fileDiff || hs.size >= fileChanges.length) continue;
      const { applySelectedHunks } = require('./git-util');
      map.set(path, applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, hs));
    }
    return map;
  }, [stagedHunks]);

  const { onNoCwd, prepareForRepos, clearPersisted } = useGitReviewPersistence({
    cwd,
    repos,
    statusLoading,
    committing: false,
    selected,
    stagedPaths,
    stagedHunks,
    lineChangesByPath: lineChangesCacheRef.current,
    partialContentByPath,
    onApplySnapshot: applyRestoreSnapshot,
    pendingHunkKeysRef: pendingHunkRestoreRef,
  });

  // ── Commit flow ──────────────────────────────────────────────────────────
  const { committing, commitError, handleCommit, handleGenerateMessage, handleFetchLastMessage } =
    useCommitFlow(
      repos,
      stagedPaths,
      stagedHunks,
      diffCaches,
      partialContentRefs,
      cwd,
      connectionSlug,
      model,
      sessionId,
      loadStatus,
      clearPersisted,
    );

  // ── Line changes ──────────────────────────────────────────────────────────
  const handleDiffComputed = useCallback(
    (changes: LineChange[]) => {
      setCurrentChanges(changes);
      if (!selected) return;

      const path = selected.absolutePath;
      lineChangesCacheRef.current.set(path, changes);

      // Check if this file has a pending hunk restore
      const pending = pendingHunkRestoreRef.current.get(path);
      if (pending) {
        const selectedIndices = new Set<number>();
        changes.forEach((c, i) => {
          if (pending.has(hunkKey(c))) selectedIndices.add(i);
        });
        pendingHunkRestoreRef.current.delete(path);
        setPendingPartialPaths((prev) => {
          const n = new Set(prev);
          n.delete(path);
          return n;
        });

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
        if (selectedIndices.size === changes.length) {
          restoredPartialContentRef.current.delete(path);
        }
        return;
      }

      // Initialize hunk staging for this file if not already set
      setStagedHunks((prev) => {
        if (prev.has(path)) return prev;
        const next = new Map(prev);
        if (stagedPaths.has(path)) next.set(path, new Set(changes.map((_, i) => i)));
        else next.set(path, new Set());
        return next;
      });
    },
    [selected, stagedPaths, setStagedPaths, setStagedHunks, setPendingPartialPaths],
  );

  // ── Rendering ──────────────────────────────────────────────────────────────
  const totalFiles = repos.reduce((n, r) => n + r.files.length, 0);
  const selectedHunks = selected
    ? stagedPaths.has(selected.absolutePath)
      ? stagedHunks.get(selected.absolutePath) ?? null
      : new Set<number>()
    : null;

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
        <div className="flex w-80 shrink-0 flex-col border-r border-border/60 bg-panel">
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
            branchesByRepo={branchesByRepo}
            selected={selected}
            onSelect={setSelected}
            stagedPaths={stagedPaths}
            onToggleStage={handleToggleFile}
            onToggleRepoStage={handleToggleRepo}
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
                onToggleHunk={(idx) => handleToggleHunk(selected, idx, currentChanges.length)}
                onDiffComputed={handleDiffComputed}
              />
            </div>
          )}
        </div>
      </div>
    </ExpandModal>
  );
}
