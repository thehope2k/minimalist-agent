import { useCallback } from 'react';
import type { FileTreeNode } from '../types';

interface UseTreeFilterParams {
  tree: FileTreeNode[];
  expandedPaths: Set<string>;
  filterQuery: string;
}

interface FlattenedResult {
  items: Array<{ node: FileTreeNode; depth: number }>;
  autoExpandedPaths: Set<string>;
}

/**
 * Handles tree filtering, flattening, and auto-expansion logic.
 * When filtering: auto-expands parent folders to reveal matches.
 */
export function useTreeFilter({
  tree,
  expandedPaths,
  filterQuery,
}: UseTreeFilterParams) {
  // Check if any descendant matches the filter
  const hasDescendantMatch = useCallback(
    (nodes: FileTreeNode[] | null, query: string): boolean => {
      if (!nodes) return false;
      for (const node of nodes) {
        if (node.name.toLowerCase().includes(query)) return true;
        if (node.children && hasDescendantMatch(node.children, query))
          return true;
      }
      return false;
    },
    [],
  );

  // Flatten tree for rendering (respects expanded state and filter)
  // When filtering: auto-expand parent folders to reveal matches
  const flattenedTree = useCallback((): FlattenedResult => {
    const result: Array<{ node: FileTreeNode; depth: number }> = [];
    const lowerQuery = filterQuery.trim().toLowerCase();
    const autoExpandedPaths = new Set<string>();

    const traverse = (nodes: FileTreeNode[], depth: number) => {
      for (const node of nodes) {
        // Filter logic: include if name matches or any descendant matches
        const nameMatches =
          !lowerQuery || node.name.toLowerCase().includes(lowerQuery);
        const hasMatchingDescendant =
          lowerQuery && node.children
            ? hasDescendantMatch(node.children, lowerQuery)
            : false;

        if (nameMatches || hasMatchingDescendant) {
          result.push({ node, depth });

          // Auto-expand folders when filtering to reveal matches inside
          const shouldExpand =
            node.type === 'directory' &&
            node.children &&
            (expandedPaths.has(node.absolutePath) || // User manually expanded
              (lowerQuery && hasMatchingDescendant)); // Auto-expand to reveal filtered matches

          if (shouldExpand) {
            if (
              lowerQuery &&
              hasMatchingDescendant &&
              !expandedPaths.has(node.absolutePath)
            ) {
              autoExpandedPaths.add(node.absolutePath);
            }
            traverse(node.children!, depth + 1); // Non-null: already checked in shouldExpand
          }
        }
      }
    };

    traverse(tree, 0);
    return { items: result, autoExpandedPaths };
  }, [tree, expandedPaths, filterQuery, hasDescendantMatch]);

  const { items, autoExpandedPaths } = flattenedTree();

  // Track which folders are auto-expanded (for visual indication)
  const isAutoExpanded = useCallback(
    (path: string) => autoExpandedPaths.has(path),
    [autoExpandedPaths],
  );

  return {
    flatItems: items,
    isAutoExpanded,
  };
}
