import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { scoreEntry } from '@/lib/files';
import type { FileSearchEntry, ContentMatchEntry } from '@/lib/electron';
import type { SearchItem } from './types';
import { FILES_LIMIT } from './types';

export function useSearchResults(
  fileResults: FileSearchEntry[],
  grepResults: ContentMatchEntry[],
  query: string,
) {
  const [activeIdx, setActiveIdx] = useState(0);
  const mouseMovedRef = useRef(false);

  // Filter and score file results
  const filteredFiles = useMemo<FileSearchEntry[]>(() => {
    const filesOnly = fileResults.filter((e) => e.type === 'file');
    if (!query.trim()) return filesOnly.slice(0, FILES_LIMIT);
    return filesOnly
      .map((e) => ({ entry: e, score: scoreEntry(e, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, FILES_LIMIT)
      .map((x) => x.entry);
  }, [fileResults, query]);

  // Flat item list for keyboard nav
  const items: SearchItem[] = useMemo(
    () => [
      ...filteredFiles.map((entry) => ({ kind: 'file' as const, entry })),
      ...grepResults.map((entry) => ({ kind: 'grep' as const, entry })),
    ],
    [filteredFiles, grepResults],
  );

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
    mouseMovedRef.current = false;
  }, [items.length, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, onOpenItem: (item: SearchItem) => void) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[activeIdx];
        if (item) onOpenItem(item);
      }
    },
    [items, activeIdx],
  );

  return {
    filteredFiles,
    items,
    activeIdx,
    mouseMovedRef,
    setActiveIdx,
    handleKeyDown,
  };
}
