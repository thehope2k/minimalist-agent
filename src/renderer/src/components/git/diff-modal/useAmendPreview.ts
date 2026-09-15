import { useCallback, useEffect, useState } from 'react';
import { resolveAmendRepoRoot, type LastCommitFileEntry } from '../git-util';
import type { AmendPreview } from '../CommitPanel';
import type { GitFileDiff, GitFileEntry, GitRepo } from '../types';

interface UseAmendPreviewArgs {
  cwd: string | null;
  repos: GitRepo[];
  stagedPaths: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<GitFileEntry | null>>;
}

export function useAmendPreview({
  cwd,
  repos,
  stagedPaths,
  setSelected,
}: UseAmendPreviewArgs) {
  const [amendPreview, setAmendPreview] = useState<AmendPreview | null>(null);
  const [selectedAmendFile, setSelectedAmendFile] = useState<LastCommitFileEntry | null>(null);
  const [amendFileDiff, setAmendFileDiff] = useState<GitFileDiff | null>(null);
  const [amendFileLoading, setAmendFileLoading] = useState(false);

  useEffect(() => {
    if (!amendPreview) {
      setSelectedAmendFile(null);
      setAmendFileDiff(null);
    }
  }, [amendPreview]);

  const clearSelectedAmendFile = useCallback(() => {
    setSelectedAmendFile(null);
    setAmendFileDiff(null);
  }, []);

  const selectAmendFile = useCallback(
    (file: LastCommitFileEntry) => {
      const repoRoot = resolveAmendRepoRoot(repos, stagedPaths, cwd);
      if (!repoRoot) return;
      setSelected(null);
      setSelectedAmendFile(file);
      setAmendFileDiff(null);
      setAmendFileLoading(true);
      window.api.git
        .lastCommitFileDiff({
          repoRoot,
          relativePath: file.path,
          oldPath: file.oldPath,
          status: file.status,
        })
        .then(setAmendFileDiff)
        .catch(() => setAmendFileDiff(null))
        .finally(() => setAmendFileLoading(false));
    },
    [cwd, repos, setSelected, stagedPaths],
  );

  return {
    amendPreview,
    setAmendPreview,
    selectedAmendFile,
    amendFileDiff,
    amendFileLoading,
    clearSelectedAmendFile,
    selectAmendFile,
  };
}
