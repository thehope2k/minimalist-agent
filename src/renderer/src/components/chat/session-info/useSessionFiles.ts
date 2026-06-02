import { useEffect, useState } from 'react';
import type { SessionFileNode } from '@/lib/electron';

/**
 * Loads session files whenever the popover opens.
 * Refreshes on every open to stay current with newly stored attachments.
 */
export function useSessionFiles(open: boolean, sessionId: string | null) {
  const [files, setFiles] = useState<SessionFileNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    setLoading(true);
    let alive = true;
    void window.api.sessions.listFiles(sessionId).then((tree) => {
      if (!alive) return;
      setFiles(tree);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, sessionId]);

  const revealInFinder = () => {
    if (sessionId) void window.api.sessions.revealInFolder(sessionId);
  };

  return { files, loading, revealInFinder };
}
