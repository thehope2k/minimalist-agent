import { useState, useEffect } from 'react';
import type { ConflictContent, GitFileEntry } from '../types';

/**
 * Loads 3-way conflict content (base, ours, theirs, working) from main process.
 */
export function useConflictContent(file: GitFileEntry) {
  const [content, setContent] = useState<ConflictContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    window.api.git
      .conflictContent({
        repoRoot: file.repoRoot,
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
      })
      .then((c) => {
        setContent(c);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load conflict content');
      })
      .finally(() => setLoading(false));
  }, [file.absolutePath, file.relativePath, file.repoRoot]);

  return { content, loading, loadError };
}
