import { useEffect, useState, useRef, useCallback } from 'react';
import { Search, Loader2, FolderOpen, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TreeNode } from './TreeNode';
import { cn } from '@/lib/utils';
import { loadFullSession, updateSessionMeta } from '@/lib/sessions';
import type { FileTreeNode } from './types';

interface FileExplorerPanelProps {
  cwd: string | undefined;
  sessionId: string | null;
  isOpen: boolean;
  onSelectFile: (absolutePath: string) => void;
  onClose: () => void;
}

export function FileExplorerPanel({
  cwd,
  sessionId,
  isOpen,
  onSelectFile,
  onClose,
}: FileExplorerPanelProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Clear filter when session changes (different CWD = different file tree)
  useEffect(() => {
    setFilterQuery('');
  }, [sessionId]);

  // Load initial tree when CWD changes
  useEffect(() => {
    if (!cwd || !isOpen) {
      setTree([]);
      return;
    }

    setLoading(true);
    setError(null);

    window.api.files
      .buildFileTree({ path: cwd, root: cwd, maxDepth: 3 })
      .then((nodes) => {
        setTree(nodes);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load file tree:', err);
        setError('Failed to load directory');
        setLoading(false);
      });
  }, [cwd, isOpen]);

  // Toggle folder expansion
  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Load expanded paths from session metadata on session switch
  useEffect(() => {
    if (!sessionId) {
      setExpandedPaths(new Set());
      return;
    }

    loadFullSession(sessionId)
      .then((session) => {
        if (!session) {
          setExpandedPaths(new Set());
          return;
        }
        const paths = session.meta.fileExplorer?.expandedPaths ?? [];
        setExpandedPaths(new Set(paths));
      })
      .catch((err) => {
        console.error('Failed to load session metadata:', err);
        setExpandedPaths(new Set());
      });
  }, [sessionId]);

  // Save expanded paths to session metadata (debounced)
  useEffect(() => {
    if (!sessionId) return;

    const timeout = setTimeout(() => {
      const paths = Array.from(expandedPaths);
      updateSessionMeta(sessionId, {
        fileExplorer: { expandedPaths: paths },
      }).catch((err) => {
        console.error('Failed to save file explorer state:', err);
      });
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [expandedPaths, sessionId]);

  // Flatten tree for rendering (respects expanded state and filter)
  // When filtering: auto-expand parent folders to reveal matches
  const flattenedTree = useCallback(() => {
    const result: Array<{ node: FileTreeNode; depth: number }> = [];
    const lowerQuery = filterQuery.trim().toLowerCase();
    const autoExpandedPaths = new Set<string>();

    const traverse = (nodes: FileTreeNode[], depth: number) => {
      for (const node of nodes) {
        // Filter logic: include if name matches or any descendant matches
        const nameMatches = !lowerQuery || node.name.toLowerCase().includes(lowerQuery);
        const hasMatchingDescendant = lowerQuery && node.children
          ? hasDescendantMatch(node.children, lowerQuery)
          : false;

        if (nameMatches || hasMatchingDescendant) {
          result.push({ node, depth });

          // Auto-expand folders when filtering to reveal matches inside
          const shouldExpand = node.type === 'directory' && node.children && (
            expandedPaths.has(node.absolutePath) || // User manually expanded
            (lowerQuery && hasMatchingDescendant)    // Auto-expand to reveal filtered matches
          );

          if (shouldExpand) {
            if (lowerQuery && hasMatchingDescendant && !expandedPaths.has(node.absolutePath)) {
              autoExpandedPaths.add(node.absolutePath);
            }
            traverse(node.children!, depth + 1); // Non-null: already checked in shouldExpand
          }
        }
      }
    };

    traverse(tree, 0);
    return { items: result, autoExpandedPaths };
  }, [tree, expandedPaths, filterQuery]);

  // Check if any descendant matches the filter
  const hasDescendantMatch = (nodes: FileTreeNode[] | null, query: string): boolean => {
    if (!nodes) return false;
    for (const node of nodes) {
      if (node.name.toLowerCase().includes(query)) return true;
      if (node.children && hasDescendantMatch(node.children, query)) return true;
    }
    return false;
  };

  const { items: flatItems, autoExpandedPaths } = flattenedTree();

  // Track which folders are auto-expanded (for visual indication)
  const isAutoExpanded = (path: string) => autoExpandedPaths.has(path);

  // Virtual scrolling for large trees (>200 items)
  const VIRTUALIZE_THRESHOLD = 200;
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
      console.log(`[FileExplorer] Virtual scrolling activated for ${flatItems.length} items`);
    }
  }, [useVirtual, flatItems.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      // Only handle when panel is focused
      if (!containerRef.current?.contains(document.activeElement)) return;

      const currentIndex = flatItems.findIndex((item) => item.node.absolutePath === selectedPath);

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
  }, [isOpen, flatItems, selectedPath, expandedPaths, toggleExpand, onSelectFile, onClose]);

  // Auto-select first item when tree loads
  useEffect(() => {
    if (flatItems.length > 0 && !selectedPath) {
      setSelectedPath(flatItems[0].node.absolutePath);
    }
  }, [flatItems, selectedPath]);

  // Scroll to selected item when using virtual scrolling
  useEffect(() => {
    if (!useVirtual || !selectedPath) return;
    const index = flatItems.findIndex((item) => item.node.absolutePath === selectedPath);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
    }
  }, [selectedPath, useVirtual, flatItems, virtualizer]);

  // Auto-focus filter input when panel opens (so user can immediately type to search)
  useEffect(() => {
    if (isOpen && filterInputRef.current) {
      // Small delay to ensure panel animation completes
      setTimeout(() => {
        filterInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!cwd) {
    return (
      <div className="flex h-full flex-col bg-panel">
        <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
          <FolderOpen className="mr-2 h-4 w-4 text-fg-muted" />
          <h2 className="text-sm font-medium text-fg">Files</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-xs text-fg-subtle">
            No working directory set
            <br />
            <span className="text-fg-muted">Select a folder for this session</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-panel" ref={containerRef} tabIndex={-1}>
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <FolderOpen className="mr-2 h-4 w-4 text-fg-muted" />
        <h2 className="flex-1 truncate text-sm font-medium text-fg" title={cwd}>
          Files
        </h2>
        <button
          onClick={onClose}
          className="ml-2 rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg"
          aria-label="Close file explorer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter input */}
      <div className="shrink-0 border-b border-border p-2">
        <div className="flex items-center gap-1.5 rounded border border-border bg-elevated px-2 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-panel hover:text-fg"
              aria-label="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree view */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {loading && (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
            <span className="ml-2 text-xs text-fg-subtle">Loading...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center p-6">
            <p className="text-center text-xs text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && flatItems.length === 0 && (
          <div className="flex items-center justify-center p-6">
            <p className="text-center text-xs text-fg-subtle">
              {filterQuery ? 'No files match filter' : '(empty directory)'}
            </p>
          </div>
        )}

        {!loading && !error && flatItems.length > 0 && (
          useVirtual ? (
            // Virtual scrolling for large trees
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = flatItems[virtualItem.index];
                return (
                  <div
                    key={item.node.absolutePath}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <TreeNode
                      node={item.node}
                      depth={item.depth}
                      isExpanded={expandedPaths.has(item.node.absolutePath) || isAutoExpanded(item.node.absolutePath)}
                      isSelected={item.node.absolutePath === selectedPath}
                      onToggle={toggleExpand}
                      onSelect={setSelectedPath}
                      onDoubleClick={onSelectFile}
                      cwd={cwd}
                      highlightQuery={filterQuery.trim()}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            // Simple rendering for small trees
            <div>
              {flatItems.map((item, index) => (
                <TreeNode
                  key={item.node.absolutePath}
                  node={item.node}
                  depth={item.depth}
                  isExpanded={expandedPaths.has(item.node.absolutePath) || isAutoExpanded(item.node.absolutePath)}
                  isSelected={item.node.absolutePath === selectedPath}
                  onToggle={toggleExpand}
                  onSelect={setSelectedPath}
                  onDoubleClick={onSelectFile}
                  cwd={cwd}
                  highlightQuery={filterQuery.trim()}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
