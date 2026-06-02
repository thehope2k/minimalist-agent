import { useEffect, useState } from 'react';
import type { EngagementRequest, EngagementResponse } from './types';

/**
 * Manages the queue of collaboration requests from the main process.
 * Subscribes to events and maintains a FIFO queue.
 */
export function useCollaborationQueue() {
  const [queue, setQueue] = useState<EngagementRequest[]>([]);

  useEffect(() => {
    if (!window.api?.chat?.onCollaborationRequest) return;
    return window.api.chat.onCollaborationRequest((req) => {
      setQueue((q) => [...q, req]);
    });
  }, []);

  const current = queue[0] ?? null;

  const respond = async (response: EngagementResponse) => {
    if (!current) return;
    await window.api.chat.respondCollaboration(response);
    setQueue((q) => q.slice(1));
  };

  return { current, respond };
}
