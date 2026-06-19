import { useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileTreeNode } from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('file-explorer');

interface UseTreeVirtualizationParams {
  flatItems: Array<{ node: FileTreeNode; depth: number }>;
  selectedPath: string | null;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

const VIRTUALIZE_THRESHOLD = 200;

/**
 * Manages virtual scrolling for large trees (>200 items).
 * Uses @tanstack/react-virtual for performance optimization.
 */
export function useTreeVirtualization({
  flatItems,
  selectedPath,
  scrollContainerRef,
}: UseTreeVirtualizationParams) {
  const useVirtual = flatItems.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 28, // TreeNode height in px
    overscan: 10, // Render 10 extra items above/below viewport
    enabled: useVirtual,
  });

  // Log virtual scrolling activation (helpful for debugging performance)
  useEffect(() => {
    if (useVirtual) {
      log.debug(
        `Virtual scrolling activated for ${flatItems.length} items`,
      );
    }
  }, [useVirtual, flatItems.length]);

  // Scroll to selected item when using virtual scrolling
  useEffect(() => {
    if (!useVirtual || !selectedPath) return;
    const index = flatItems.findIndex(
      (item) => item.node.absolutePath === selectedPath,
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
    }
  }, [selectedPath, useVirtual, flatItems, virtualizer]);

  return {
    useVirtual,
    virtualizer,
  };
}
