import { useState, useEffect } from 'react';
import type { GitFileEntry, GitFileDiff } from '../types';
import type { DiffCaches } from './types';

/**
 * Manages selected file state and loads diff when selection changes.
 * Caches diffs and line changes for all files.
 */
export function useFileSelection(allFiles: GitFileEntry[], diffCaches: DiffCaches) {
  const [selected, setSelected] = useState<GitFileEntry | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);

  // Auto-select first file when files list changes
  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return allFiles[0] ?? null;
      return allFiles.find((f) => f.absolutePath === prev.absolutePath) ?? (allFiles[0] ?? null);
    });
  }, [allFiles]);

  // Load diff when selection changes
  useEffect(() => {
    if (!selected) {
      setDiff(null);
      return;
    }

    let cancelled = false;
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
          diffCaches.diffs.set(selected.absolutePath, fileDiff);
        }
      })
      .catch(() => {
        if (!cancelled) setDiff(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, diffCaches.diffs]);

  return {
    selected,
    setSelected,
    diff,
  };
}
