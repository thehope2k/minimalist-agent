import { useEffect, useRef, useState, useCallback } from 'react';
import type { FileTreeNode } from '../types';
import { loadFullSession, updateSessionMeta } from '@/lib/sessions';
import { createLogger } from '@/lib/logger';

const log = createLogger('useFileTree');

interface UseFileTreeParams {
  cwd: string | undefined;
  sessionId: string | null;
  isOpen: boolean;
  /** Active filter query; a non-empty value triggers a full-depth tree load for search. */
  filterQuery: string;
}

/** Effectively unlimited depth for the search tree, but bounded to avoid pathological trees. */
const SEARCH_MAX_DEPTH = 20;

/**
 * Mark every directory that already has its children loaded (non-empty) so we
 * don't re-fetch them when the user expands them. Boundary directories left
 * empty by the depth-limited initial build are intentionally NOT seeded, so
 * they get lazily loaded on first expand.
 */
function seedLoadedDirs(nodes: FileTreeNode[], loaded: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'directory' && node.children && node.children.length > 0) {
      loaded.add(node.absolutePath);
      seedLoadedDirs(node.children, loaded);
    }
  }
}

/** Return a new tree with `targetPath`'s children replaced (immutably). */
function replaceChildren(
  nodes: FileTreeNode[],
  targetPath: string,
  newChildren: FileTreeNode[],
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.absolutePath === targetPath) {
      return { ...node, children: newChildren };
    }
    if (node.type === 'directory' && node.children && node.children.length > 0) {
      return {
        ...node,
        children: replaceChildren(node.children, targetPath, newChildren),
      };
    }
    return node;
  });
}

/** Collect expanded directories present in the tree whose children aren't loaded yet. */
function collectUnloadedExpanded(
  nodes: FileTreeNode[],
  expanded: Set<string>,
  loaded: Set<string>,
  out: FileTreeNode[],
): void {
  for (const node of nodes) {
    if (node.type !== 'directory') continue;
    if (expanded.has(node.absolutePath) && !loaded.has(node.absolutePath)) {
      out.push(node);
    }
    if (node.children && node.children.length > 0) {
      collectUnloadedExpanded(node.children, expanded, loaded, out);
    }
  }
}

/**
 * Manages file tree state: loading tree from IPC, expansion state, and session persistence.
 * Handles tree loading, folder expansion toggles, and saves/loads expansion state to session metadata.
 */
export function useFileTree({ cwd, sessionId, isOpen, filterQuery }: UseFileTreeParams) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full-depth tree loaded on demand the first time the user searches, so the
  // filter can match files deeper than the lazily-loaded browse tree.
  const [fullTree, setFullTree] = useState<FileTreeNode[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const hasQuery = filterQuery.trim().length > 0;

  // Tracks directories whose children have already been loaded (or fetched as
  // empty), and those with an in-flight fetch — used by the lazy-load effect.
  const loadedDirs = useRef<Set<string>>(new Set());
  const loadingDirs = useRef<Set<string>>(new Set());

  // Load initial tree when CWD changes
  useEffect(() => {
    if (!cwd || !isOpen) {
      setTree([]);
      return;
    }

    setLoading(true);
    setError(null);
    loadedDirs.current = new Set();
    loadingDirs.current = new Set();
    setFullTree(null);

    // includeHidden so dotfiles/dotfolders (.github, .vscode, …) are visible.
    window.api.files
      .buildFileTree({ path: cwd, root: cwd, maxDepth: 3, includeHidden: true })
      .then((nodes) => {
        seedLoadedDirs(nodes, loadedDirs.current);
        setTree(nodes);
        setLoading(false);
      })
      .catch((err) => {
        log.error('Failed to load file tree:', err);
        setError('Failed to load directory');
        setLoading(false);
      });
  }, [cwd, isOpen]);

  // Lazily fetch children for expanded directories that weren't loaded by the
  // depth-limited initial build. Cascades: loading a parent reveals nested
  // expanded folders, which re-runs this effect to load them too.
  useEffect(() => {
    if (!cwd) return;

    const unloaded: FileTreeNode[] = [];
    collectUnloadedExpanded(tree, expandedPaths, loadedDirs.current, unloaded);
    const toLoad = unloaded.filter(
      (node) => !loadingDirs.current.has(node.absolutePath),
    );
    if (toLoad.length === 0) return;

    let cancelled = false;
    for (const node of toLoad) {
      loadingDirs.current.add(node.absolutePath);
      window.api.files
        .listDirectory({ path: node.absolutePath, root: cwd, includeHidden: true })
        .then((children) => {
          loadedDirs.current.add(node.absolutePath);
          loadingDirs.current.delete(node.absolutePath);
          seedLoadedDirs(children, loadedDirs.current);
          if (cancelled) return;
          setTree((prev) => replaceChildren(prev, node.absolutePath, children));
        })
        .catch((err) => {
          loadingDirs.current.delete(node.absolutePath);
          log.error('Failed to load directory children:', err);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [tree, expandedPaths, cwd]);

  // Load the full-depth tree the first time a search query is entered (cached
  // until the working directory changes). Filtering then runs against this
  // complete tree instead of the partially-loaded browse tree.
  useEffect(() => {
    if (!cwd || !isOpen || !hasQuery || fullTree || searchLoading) return;

    setSearchLoading(true);
    window.api.files
      .buildFileTree({
        path: cwd,
        root: cwd,
        maxDepth: SEARCH_MAX_DEPTH,
        includeHidden: true,
      })
      .then((nodes) => {
        setFullTree(nodes);
        setSearchLoading(false);
      })
      .catch((err) => {
        log.error('Failed to load full file tree for search:', err);
        setSearchLoading(false);
      });
  }, [cwd, isOpen, hasQuery, fullTree, searchLoading]);

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
        log.error('Failed to load session metadata:', err);
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
        log.error('Failed to save file explorer state:', err);
      });
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [expandedPaths, sessionId]);

  // While searching, filter against the complete tree (falling back to the
  // browse tree until the full load resolves). Otherwise show the lazy tree.
  const activeTree = hasQuery && fullTree ? fullTree : tree;

  return {
    tree: activeTree,
    expandedPaths,
    loading,
    searchLoading: hasQuery && !fullTree && searchLoading,
    error,
    toggleExpand,
  };
}
