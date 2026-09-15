import { useMemo, useRef } from 'react';
import { applySelectedHunks } from '../git-util';
import type { GitFileDiff, LineChange } from '../types';
import type { PartialContentRefs } from './types';

export function usePartialContentRefs() {
  const pendingHunkRestoreRef = useRef<Map<string, Set<string>>>(new Map());
  const restoredPartialContentRef = useRef<Map<string, string>>(new Map());
  const partialContentRefs: PartialContentRefs = {
    pendingHunkKeys: pendingHunkRestoreRef.current,
    restoredPartialContent: restoredPartialContentRef.current,
  };

  return {
    partialContentRefs,
    pendingHunkRestoreRef,
    restoredPartialContentRef,
  };
}

export function usePartialHunkContent(
  diffCache: Map<string, GitFileDiff>,
  lineChangesCache: Map<string, LineChange[]>,
  stagedHunks: Map<string, Set<number>>,
) {
  return useMemo(() => {
    const contentByPath = new Map<string, string>();
    for (const [path, stagedIndices] of stagedHunks) {
      if (stagedIndices.size === 0) continue;
      const fileDiff = diffCache.get(path);
      const fileChanges = lineChangesCache.get(path) ?? [];
      if (!fileDiff || stagedIndices.size >= fileChanges.length) continue;
      contentByPath.set(
        path,
        applySelectedHunks(fileDiff.original, fileDiff.modified, fileChanges, stagedIndices),
      );
    }
    return contentByPath;
  }, [diffCache, lineChangesCache, stagedHunks]);
}
