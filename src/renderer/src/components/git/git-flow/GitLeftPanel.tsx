import { CommitPanel } from '../CommitPanel';
import { GitFileList } from '../GitFileList';
import type { GitFileEntry, GitRepo } from '../types';

interface GitLeftPanelProps {
  statusLoading: boolean;
  statusError: string | null;
  repos: GitRepo[];
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
  onGenerateMessage: (amend: boolean) => Promise<string | null>;
  committing: boolean;
  error: string | null;
}

export function GitLeftPanel(props: GitLeftPanelProps) {
  const {
    statusLoading,
    statusError,
    repos,
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
    onGenerateMessage,
    committing,
    error,
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
          selected={selected}
          onSelect={onSelect}
          stagedPaths={stagedPaths}
          onToggleStage={onToggleStage}
          onToggleRepoStage={onToggleRepoStage}
          hunkStates={hunkStates}
        />
      </div>
      <CommitPanel
        stagedCount={stagedCount}
        totalCount={totalCount}
        stagedRepos={stagedRepos}
        onCommit={onCommit}
        onFetchLastMessage={onFetchLastMessage}
        onGenerateMessage={onGenerateMessage}
        committing={committing}
        error={error}
      />
    </>
  );
}
