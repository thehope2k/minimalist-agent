import { useEffect, useState, useCallback } from 'react';
import type { FileTreeNode } from '../types';
import { loadFullSession, updateSessionMeta } from '@/lib/sessions';

interface UseFileTreeParams {
  cwd: string | undefined;
  sessionId: string | null;
  isOpen: boolean;
}

/**
 * Manages file tree state: loading tree from IPC, expansion state, and session persistence.
 * Handles tree loading, folder expansion toggles, and saves/loads expansion state to session metadata.
 */
export function useFileTree({ cwd, sessionId, isOpen }: UseFileTreeParams) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return {
    tree,
    expandedPaths,
    loading,
    error,
    toggleExpand,
  };
}
