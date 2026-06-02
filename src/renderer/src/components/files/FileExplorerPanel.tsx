import { useEffect, useState, useRef } from 'react';
import type { FileExplorerPanelProps } from './types';
import { useFileTree } from './file-explorer-panel/useFileTree';
import { useTreeFilter } from './file-explorer-panel/useTreeFilter';
import { useKeyboardNav } from './file-explorer-panel/useKeyboardNav';
import { useTreeVirtualization } from './file-explorer-panel/useTreeVirtualization';
import { EmptyStates } from './file-explorer-panel/EmptyStates';
import { TreeHeader } from './file-explorer-panel/TreeHeader';
import { FilterInput } from './file-explorer-panel/FilterInput';
import { TreeView } from './file-explorer-panel/TreeView';

/**
 * File explorer panel — browse project files with keyboard navigation and filtering.
 * Supports virtual scrolling for large trees (>200 items) and persists expansion state to session metadata.
 */
export function FileExplorerPanel({
  cwd,
  sessionId,
  isOpen,
  onSelectFile,
  onClose,
}: FileExplorerPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Clear filter when session changes (different CWD = different file tree)
  useEffect(() => {
    setFilterQuery('');
  }, [sessionId]);

  // Load tree and manage expansion state
  const { tree, expandedPaths, loading, error, toggleExpand } = useFileTree({
    cwd,
    sessionId,
    isOpen,
  });

  // Filter and flatten tree
  const { flatItems, isAutoExpanded } = useTreeFilter({
    tree,
    expandedPaths,
    filterQuery,
  });

  // Virtual scrolling for large trees
  const { useVirtual, virtualizer } = useTreeVirtualization({
    flatItems,
    selectedPath,
    scrollContainerRef,
  });

  // Keyboard navigation
  useKeyboardNav({
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
  });

  // Auto-select first item when tree loads
  useEffect(() => {
    if (flatItems.length > 0 && !selectedPath) {
      setSelectedPath(flatItems[0].node.absolutePath);
    }
  }, [flatItems, selectedPath]);

  // Auto-focus filter input when panel opens
  useEffect(() => {
    if (isOpen && filterInputRef.current) {
      // Small delay to ensure panel animation completes
      setTimeout(() => {
        filterInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // No CWD state
  if (!cwd) {
    return <EmptyStates loading={false} error={null} hasItems={false} filterQuery="" cwd={cwd} />;
  }

  return (
    <div className="flex h-full flex-col bg-panel" ref={containerRef} tabIndex={-1}>
      <TreeHeader cwd={cwd} onClose={onClose} />

      <FilterInput
        value={filterQuery}
        onChange={setFilterQuery}
        inputRef={filterInputRef}
      />

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <EmptyStates
          loading={loading}
          error={error}
          hasItems={flatItems.length > 0}
          filterQuery={filterQuery}
          cwd={cwd}
        />

        {!loading && !error && flatItems.length > 0 && (
          <TreeView
            flatItems={flatItems}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            toggleExpand={toggleExpand}
            setSelectedPath={setSelectedPath}
            onSelectFile={onSelectFile}
            isAutoExpanded={isAutoExpanded}
            cwd={cwd}
            filterQuery={filterQuery}
            useVirtual={useVirtual}
            virtualizer={useVirtual ? virtualizer : undefined}
          />
        )}
      </div>
    </div>
  );
}
