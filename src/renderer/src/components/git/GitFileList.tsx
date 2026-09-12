// Left panel of the git diff modal: repo groups with file lists.
// Keyboard navigable (↑↓), click to select, status badges + colored filenames.

import { useEffect, useRef, useState } from 'react';
import type { GitFileEntry, GitRepo } from './types';
import type { AmendPreview } from './CommitPanel';
import { AmendPreviewSection } from './git-file-list/AmendPreviewSection';
import { RepoSection } from './git-file-list/RepoSection';

interface GitFileListProps {
  repos: GitRepo[];
  branchesByRepo?: Map<string, string | null>;
  selected: GitFileEntry | null;
  onSelect: (file: GitFileEntry) => void;
  stagedPaths: Set<string>;
  onToggleStage: (file: GitFileEntry) => void;
  onToggleRepoStage: (repo: GitRepo) => void;
  /** Optional per-file hunk staging info for indeterminate state. */
  hunkStates?: Map<string, { staged: number; total: number }>;
  /** Files touched by the commit being amended — shown as a muted, read-only group below current changes. */
  amendPreview?: AmendPreview | null;
  /** Currently viewed amend-preview file, if any (mutually exclusive with `selected`). */
  selectedAmendFile?: { path: string } | null;
  onSelectAmendFile?: (file: AmendPreview['files'][number]) => void;
}

export function GitFileList({
  repos,
  branchesByRepo,
  selected,
  onSelect,
  stagedPaths,
  onToggleStage,
  onToggleRepoStage,
  hunkStates,
  amendPreview,
  selectedAmendFile,
  onSelectAmendFile,
}: GitFileListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedRoots((previous) => {
      const next = new Set([...previous].filter((root) => repos.some((repo) => repo.root === root)));
      if (selected?.repoRoot) next.delete(selected.repoRoot);
      return next;
    });
  }, [repos, selected?.repoRoot]);

  const visibleFiles = repos.flatMap((repo) => (collapsedRoots.has(repo.root) ? [] : repo.files));

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const index = selected
        ? visibleFiles.findIndex((file) => file.absolutePath === selected.absolutePath)
        : -1;
      const next = event.key === 'ArrowDown'
        ? Math.min(visibleFiles.length - 1, index + 1)
        : Math.max(0, index - 1);
      if (visibleFiles[next]) onSelect(visibleFiles[next]);
    };
    element.addEventListener('keydown', handler);
    return () => element.removeEventListener('keydown', handler);
  }, [visibleFiles, selected, onSelect]);

  if (repos.length === 0 && !(amendPreview && amendPreview.files.length > 0)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-center text-xs text-fg-subtle">No uncommitted changes</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} tabIndex={0} className="scroll-thin flex h-full flex-col overflow-y-auto outline-none">
      {repos.map((repo, index) => (
        <RepoSection
          key={repo.root}
          repo={repo}
          repoIndex={index}
          branch={branchesByRepo?.get(repo.root) ?? null}
          collapsed={collapsedRoots.has(repo.root)}
          selected={selected}
          stagedPaths={stagedPaths}
          hunkStates={hunkStates}
          onToggleCollapsed={() => {
            setCollapsedRoots((previous) => {
              const next = new Set(previous);
              if (next.has(repo.root)) next.delete(repo.root);
              else next.add(repo.root);
              return next;
            });
          }}
          onSelect={onSelect}
          onToggleStage={onToggleStage}
          onToggleRepoStage={onToggleRepoStage}
        />
      ))}
      {amendPreview && amendPreview.files.length > 0 && (
        <AmendPreviewSection
          amendPreview={amendPreview}
          hasRepos={repos.length > 0}
          selectedPath={selectedAmendFile?.path}
          onSelect={onSelectAmendFile}
        />
      )}
    </div>
  );
}
