import { useEffect } from 'react';
import type { FileTreeNode } from '../types';

interface UseKeyboardNavParams {
  isOpen: boolean;
  flatItems: Array<{ node: FileTreeNode; depth: number }>;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  containerRef: React.RefObject<HTMLDivElement>;
  filterInputRef: React.RefObject<HTMLInputElement>;
  setSelectedPath: (path: string) => void;
  toggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onClose: () => void;
}

/**
 * Handles keyboard navigation for the file tree.
 * ↑/↓ - Navigate items
 * ←/→ - Collapse/expand folders
 * Enter - Open file
 * Escape - Close panel
 * Cmd+F - Focus filter input
 */
export function useKeyboardNav({
  isOpen,
  flatItems,
  selectedPath,
  expandedPaths,
  containerRef,
  filterInputRef,
  setSelectedPath,
  toggleExpand,
  onSelectFile,
  onClose,
}: UseKeyboardNavParams) {
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      // Only handle when panel is focused
      if (!containerRef.current?.contains(document.activeElement)) return;

      const currentIndex = flatItems.findIndex(
        (item) => item.node.absolutePath === selectedPath,
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, flatItems.length - 1);
        if (nextIndex >= 0) {
          setSelectedPath(flatItems[nextIndex].node.absolutePath);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        if (prevIndex >= 0) {
          setSelectedPath(flatItems[prevIndex].node.absolutePath);
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const current = flatItems[currentIndex];
        if (current && current.node.type === 'directory') {
          if (!expandedPaths.has(current.node.absolutePath)) {
            toggleExpand(current.node.absolutePath);
          }
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const current = flatItems[currentIndex];
        if (current && current.node.type === 'directory') {
          if (expandedPaths.has(current.node.absolutePath)) {
            toggleExpand(current.node.absolutePath);
          }
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const current = flatItems[currentIndex];
        if (current && current.node.type === 'file') {
          onSelectFile(current.node.absolutePath);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Cmd+F — focus filter input
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        filterInputRef.current?.focus();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    isOpen,
    flatItems,
    selectedPath,
    expandedPaths,
    containerRef,
    filterInputRef,
    setSelectedPath,
    toggleExpand,
    onSelectFile,
    onClose,
  ]);
}
