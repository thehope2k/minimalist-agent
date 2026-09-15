// Git diff review + commit modal — opened with Cmd+G.
//
// Layout: ExpandModal with a two-column body:
//   left  ~256 px  GitFileList (file list with stage checkboxes, indeterminate for partial)
//                  CommitPanel (message + commit button, pinned bottom)
//   right flex-1   GitDiffView (Monaco DiffEditor, readonly)
//
// Staging model:
//   - All files checked by default; uncheck a file to exclude it entirely.
//   - On commit: staged files are committed via git hash-object + update-index.

import { useCallback, useMemo, useRef, useState } from 'react';
import { ExpandModal } from '@/components/ui';
import { GitDiffView } from './GitDiffView';
import { ConflictView } from './ConflictView';
import { MergeStateBanner } from './MergeStateBanner';
import { GitHeader } from './git-flow/GitHeader';
import { GitLeftPanel } from './git-flow/GitLeftPanel';
import { useGitReviewPersistence } from './git-flow/useGitReviewPersistence';
import { useMergeState } from './conflict-flow/useMergeState';
import { useConflictResolution } from './conflict-flow/useConflictResolution';
import { useGitStatus } from './diff-modal/useGitStatus';
import { useFileSelection } from './diff-modal/useFileSelection';
import { useStagingState } from './diff-modal/useStagingState';
import { useCommitFlow } from './diff-modal/useCommitFlow';
import { useAmendPreview } from './diff-modal/useAmendPreview';
import { AmendFilePreview } from './diff-modal/AmendFilePreview';
import { useHunkRestore } from './diff-modal/useHunkRestore';
import { usePartialContentRefs, usePartialHunkContent } from './diff-modal/usePartialHunkContent';
import type { GitDiffModalProps, DiffCaches } from './diff-modal/types';
import type { GitFileEntry, LineChange } from './types';

export function GitDiffModal({
  cwd,
  onClose,
  connectionSlug,
  model,
  sessionId,
}: GitDiffModalProps) {
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

  const { partialContentRefs, pendingHunkRestoreRef } = usePartialContentRefs();

  const allFiles = useMemo(() => repos.flatMap((r) => r.files), [repos]);
  const { selected, setSelected, diff } = useFileSelection(allFiles, diffCaches);

  const {
    stagedPaths,
    setStagedPaths,
    stagedHunks,
    setStagedHunks,
    setPendingPartialPaths,
    handleToggleFile,
    handleToggleRepo,
    handleToggleHunk,
    hunkStates,
  } = useStagingState(lineChangesCacheRef, partialContentRefs);

  const {
    amendPreview,
    setAmendPreview,
    selectedAmendFile,
    amendFileDiff,
    amendFileLoading,
    clearSelectedAmendFile,
    selectAmendFile,
  } = useAmendPreview({ cwd, repos, stagedPaths, setSelected });

  const handleSelectFile = useCallback(
    (file: GitFileEntry) => {
      clearSelectedAmendFile();
      setSelected(file);
    },
    [clearSelectedAmendFile, setSelected],
  );

  // ── Merge / conflict state ───────────────────────────────────────────────
  const repoRoots = useMemo(() => repos.map((r) => r.root), [repos]);
  const {
    mergeStates,
    totalConflicts,
    refresh: refreshMergeState,
  } = useMergeState({
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

  const partialContentByPath = usePartialHunkContent(
    diffCacheRef.current,
    lineChangesCacheRef.current,
    stagedHunks,
  );

  const { clearPersisted } = useGitReviewPersistence({
    cwd,
    repos,
    statusLoading,
    committing: false,
    selected,
    stagedPaths,
    stagedHunks,
    lineChangesByPath: lineChangesCacheRef.current,
    partialContentByPath,
    pendingHunkKeysRef: pendingHunkRestoreRef,
  });

  // ── Commit flow ──────────────────────────────────────────────────────────
  const {
    committing,
    commitError,
    handleCommit,
    handleGenerateMessage,
    handleFetchLastMessage,
    handleFetchLastFiles,
  } = useCommitFlow(
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

  const { handleDiffComputed } = useHunkRestore({
    selected,
    stagedPaths,
    partialContentRefs,
    pendingHunkRestoreRef,
    setCurrentChanges,
    setStagedPaths,
    setStagedHunks,
    setPendingPartialPaths,
    lineChangesCache: lineChangesCacheRef.current,
  });

  // ── Rendering ──────────────────────────────────────────────────────────────
  const totalFiles = repos.reduce((n, r) => n + r.files.length, 0);
  const selectedHunks = selected
    ? stagedPaths.has(selected.absolutePath)
      ? (stagedHunks.get(selected.absolutePath) ?? null)
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
            onSelect={handleSelectFile}
            stagedPaths={stagedPaths}
            onToggleStage={handleToggleFile}
            onToggleRepoStage={handleToggleRepo}
            hunkStates={hunkStates}
            stagedCount={stagedPaths.size}
            totalCount={totalFiles}
            stagedRepos={stagedRepos}
            onCommit={handleCommit}
            onFetchLastMessage={handleFetchLastMessage}
            onFetchLastFiles={handleFetchLastFiles}
            onGenerateMessage={handleGenerateMessage}
            committing={committing}
            error={commitError}
            onAmendPreviewChange={setAmendPreview}
            amendPreview={amendPreview}
            selectedAmendFile={selectedAmendFile}
            onSelectAmendFile={selectAmendFile}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-panel">
          {selectedAmendFile ? (
            <AmendFilePreview
              diff={amendFileDiff}
              loading={amendFileLoading}
              splitView={splitView}
            />
          ) : selected?.status === 'U' ? (
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
