import type { Virtualizer } from '@tanstack/react-virtual';
import { TreeNode } from '../TreeNode';
import type { FileTreeNode } from '../types';

interface TreeViewProps {
  flatItems: Array<{ node: FileTreeNode; depth: number }>;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  toggleExpand: (path: string) => void;
  setSelectedPath: (path: string) => void;
  onSelectFile: (path: string) => void;
  isAutoExpanded: (path: string) => boolean;
  cwd: string;
  filterQuery: string;
  useVirtual: boolean;
  virtualizer?: Virtualizer<HTMLDivElement, Element>;
}

/**
 * Renders the file tree, choosing between virtual scrolling (large trees)
 * or simple rendering (small trees).
 */
export function TreeView({
  flatItems,
  expandedPaths,
  selectedPath,
  toggleExpand,
  setSelectedPath,
  onSelectFile,
  isAutoExpanded,
  cwd,
  filterQuery,
  useVirtual,
  virtualizer,
}: TreeViewProps) {
  if (useVirtual && virtualizer) {
    // Virtual scrolling for large trees
    return (
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
                isExpanded={
                  expandedPaths.has(item.node.absolutePath) ||
                  isAutoExpanded(item.node.absolutePath)
                }
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
    );
  }

  // Simple rendering for small trees
  return (
    <div>
      {flatItems.map((item) => (
        <TreeNode
          key={item.node.absolutePath}
          node={item.node}
          depth={item.depth}
          isExpanded={
            expandedPaths.has(item.node.absolutePath) ||
            isAutoExpanded(item.node.absolutePath)
          }
          isSelected={item.node.absolutePath === selectedPath}
          onToggle={toggleExpand}
          onSelect={setSelectedPath}
          onDoubleClick={onSelectFile}
          cwd={cwd}
          highlightQuery={filterQuery.trim()}
        />
      ))}
    </div>
  );
}
