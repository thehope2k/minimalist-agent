/**
 * Collaboration prompts - engagement dialogs for intelligent collaboration.
 * 
 * Subscribes to collaboration-request events from main and shows appropriate
 * UI based on engagement type. Manages a FIFO queue of requests.
 */

import { createPortal } from 'react-dom';
import { useCollaborationQueue } from './collaboration-prompt/useCollaborationQueue';
import { DecisionDialog } from './collaboration-prompt/DecisionDialog';
import { PreferenceDialog } from './collaboration-prompt/PreferenceDialog';
import { FeedbackDialog } from './collaboration-prompt/FeedbackDialog';
import { GuidanceDialog } from './collaboration-prompt/GuidanceDialog';
import { ApprovalDialog } from './collaboration-prompt/ApprovalDialog';
import type {
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
} from './collaboration-prompt/types';

export function CollaborationPrompt() {
  const { current, respond } = useCollaborationQueue();

  if (!current) return null;

  const dialogContent = (() => {
    switch (current.type) {
      case 'decision':
        return (
          <DecisionDialog
            reqId={current.reqId}
            payload={current.payload as DecisionPayload}
            onRespond={respond}
          />
        );
      case 'preference':
        return (
          <PreferenceDialog
            reqId={current.reqId}
            payload={current.payload as PreferencePayload}
            onRespond={respond}
          />
        );
      case 'feedback':
        return (
          <FeedbackDialog
            reqId={current.reqId}
            payload={current.payload as FeedbackPayload}
            onRespond={respond}
          />
        );
      case 'guidance':
        return (
          <GuidanceDialog
            reqId={current.reqId}
            payload={current.payload as GuidancePayload}
            onRespond={respond}
          />
        );
      case 'approval':
        return (
          <ApprovalDialog
            reqId={current.reqId}
            payload={current.payload as ApprovalPayload}
            onRespond={respond}
          />
        );
      default:
        return null;
    }
  })();

  return createPortal(dialogContent, document.body);
}
