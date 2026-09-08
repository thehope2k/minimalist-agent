import { CommitPanel, type AmendPreview } from '../CommitPanel';
import { GitFileList } from '../GitFileList';
import type { GitFileEntry, GitRepo } from '../types';
import type { LastCommitFileEntry } from '../git-util';

interface GitLeftPanelProps {
  statusLoading: boolean;
  statusError: string | null;
  repos: GitRepo[];
  branchesByRepo: Map<string, string | null>;
  selected: GitFileEntry | null;
  onSelect: (file: GitFileEntry) => void;
  stagedPaths: Set<string>;
  onToggleStage: (file: GitFileEntry) => void;
  onToggleRepoStage: (repo: GitRepo) => void;
  hunkStates: Map<string, { staged: number; total: number }>;
  stagedCount: number;
  totalCount: number;
  stagedRepos: string[];
  onCommit: (message: string, amend: boolean) => Promise<void>;
  onFetchLastMessage: () => Promise<string | null>;
  onFetchLastFiles: () => Promise<string | null>;
  onGenerateMessage: (amend: boolean) => Promise<string | null>;
  committing: boolean;
  error: string | null;
  onAmendPreviewChange: (preview: AmendPreview | null) => void;
  amendPreview: AmendPreview | null;
  selectedAmendFile: LastCommitFileEntry | null;
  onSelectAmendFile: (file: LastCommitFileEntry) => void;
}

export function GitLeftPanel(props: GitLeftPanelProps) {
  const {
    statusLoading,
    statusError,
    repos,
    branchesByRepo,
    selected,
    onSelect,
    stagedPaths,
    onToggleStage,
    onToggleRepoStage,
    hunkStates,
    stagedCount,
    totalCount,
    stagedRepos,
    onCommit,
    onFetchLastMessage,
    onFetchLastFiles,
    onGenerateMessage,
    committing,
    error,
    onAmendPreviewChange,
    amendPreview,
    selectedAmendFile,
    onSelectAmendFile,
  } = props;

  if (statusLoading && !repos.length) return <div className="flex h-full items-center justify-center"><span className="text-xs text-fg-subtle">Loading…</span></div>;
  if (statusError === 'no_cwd') return <div className="flex h-full items-center justify-center p-6"><p className="text-center text-xs text-fg-subtle">Set a working directory for this session to use git review</p></div>;
  if (statusError === 'no_git_repos') return <div className="flex h-full items-center justify-center p-6"><p className="text-center text-xs text-fg-subtle">No git repositories found in this directory</p></div>;
  if (statusError) return <div className="flex h-full items-center justify-center p-6"><p className="text-center text-xs text-red-400">{statusError}</p></div>;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden">
        <GitFileList
          repos={repos}
          branchesByRepo={branchesByRepo}
          selected={selected}
          onSelect={onSelect}
          stagedPaths={stagedPaths}
          onToggleStage={onToggleStage}
          onToggleRepoStage={onToggleRepoStage}
          hunkStates={hunkStates}
          amendPreview={amendPreview}
          selectedAmendFile={selectedAmendFile}
          onSelectAmendFile={onSelectAmendFile}
        />
      </div>
      <CommitPanel
        stagedCount={stagedCount}
        totalCount={totalCount}
        stagedRepos={stagedRepos}
        onCommit={onCommit}
        onFetchLastMessage={onFetchLastMessage}
        onFetchLastFiles={onFetchLastFiles}
        onGenerateMessage={onGenerateMessage}
        committing={committing}
        error={error}
        onAmendPreviewChange={onAmendPreviewChange}
      />
    </>
  );
}
