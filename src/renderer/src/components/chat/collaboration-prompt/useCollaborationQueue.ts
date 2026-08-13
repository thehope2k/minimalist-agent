import { useEffect, useState } from 'react';
import { getAppSettings } from '@/lib/app-settings';
import { createLogger } from '@/lib/logger';
import type {
  EngagementRequest,
  EngagementResponse,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
} from './types';

const log = createLogger('useCollaborationQueue');

// The agent is blocked awaiting a human decision here — unlike turn_done/error,
// there's no other signal the user will ever see if they're in another app, so
// this needs its own notification (main's idle watchdog also stopped counting
// this as "stuck", see agent.ts pendingCollaborationRequests).
function summarize(req: EngagementRequest): { title: string; body: string } {
  switch (req.type) {
    case 'decision':
      return { title: 'Agent needs a decision', body: (req.payload as DecisionPayload).question };
    case 'preference':
      return { title: 'Agent needs your preference', body: (req.payload as PreferencePayload).question };
    case 'feedback':
      return { title: 'Agent wants feedback', body: (req.payload as FeedbackPayload).work_completed };
    case 'guidance':
      return { title: 'Agent needs guidance', body: (req.payload as GuidancePayload).what_guidance_needed };
    case 'approval':
      return { title: 'Agent needs approval', body: (req.payload as ApprovalPayload).operation };
    default:
      return { title: 'Agent is waiting on you', body: 'Switch back to respond.' };
  }
}

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
      if (getAppSettings().notificationsEnabled && !document.hasFocus()) {
        const { title, body } = summarize(req);
        window.api.app
          .notify(title, body)
          .catch((err) => log.debug('OS notification failed:', err));
      }
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
