import { useEffect, useState } from 'react';
import { searchFiles } from '@/lib/files';
import type { FileSearchEntry } from '@/lib/electron';
import { FILES_LIMIT, FILES_DEBOUNCE_MS } from './types';

export function useFileSearch(cwd: string | undefined, query: string) {
  const [fileResults, setFiles] = useState<FileSearchEntry[]>([]);

  useEffect(() => {
    if (!cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void searchFiles(cwd, query, FILES_LIMIT).then((res) => {
        if (!cancelled) setFiles(res);
      });
    }, FILES_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [cwd, query]);

  return fileResults;
}
