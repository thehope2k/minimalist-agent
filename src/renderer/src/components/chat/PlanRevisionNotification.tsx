/**
 * Plan Revision Notification - Shows when a plan is revised mid-execution.
 * 
 * Compact inline badge showing version change. Click to see details.
 */

import { useState } from 'react';
import { RefreshCw, X, ChevronRight, ChevronDown } from 'lucide-react';
import type { PlanRevision } from '@/lib/electron';

interface PlanRevisionNotificationProps {
  revision: PlanRevision;
  onDismiss: () => void;
}

export function PlanRevisionNotification({
  revision,
  onDismiss,
}: PlanRevisionNotificationProps) {
  const [expanded, setExpanded] = useState(false);
  const oldVersion = revision.version - 1;
  const newVersion = revision.version;

  if (!expanded) {
    // Compact single-line badge
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs">
        <RefreshCw className="h-3 w-3 text-accent" />
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 hover:text-fg text-fg-muted transition-colors"
        >
          <span className="font-medium">Plan revised v{oldVersion}→v{newVersion}</span>
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          onClick={onDismiss}
          className="ml-1 p-0.5 rounded hover:bg-accent/20 text-fg-subtle hover:text-fg transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="rounded-md border border-accent/30 bg-accent/10 overflow-hidden">
      <div className="px-3 py-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1.5 text-sm font-medium text-fg hover:text-accent transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <RefreshCw className="h-3.5 w-3.5 text-accent" />
            <span>Plan revised v{oldVersion}→v{newVersion}</span>
          </button>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-accent/20 text-fg-subtle hover:text-fg transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs">
          <div>
            <span className="font-medium text-fg-muted">Reason:</span>
            <p className="text-fg mt-0.5">{revision.reason}</p>
          </div>
          <div>
            <span className="font-medium text-fg-muted">Changes:</span>
            <p className="text-fg mt-0.5">{revision.changeSummary}</p>
          </div>
          {revision.changedPhases.length > 0 && (
            <div className="text-fg-subtle pt-1">
              {revision.changedPhases.length} phase(s) modified
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
