import { RefreshCw, X } from 'lucide-react';
import type { Plan } from '@/lib/electron';

interface ActionButtonsProps {
  sessionId: string;
  plan: Plan;
  onShowRevisions: () => void;
}

export function ActionButtons({
  sessionId,
  plan,
  onShowRevisions,
}: ActionButtonsProps) {
  const handleCancel = async () => {
    if (confirm('Cancel this plan? Execution will stop.')) {
      await window.api.planning.cancelPlan(sessionId);
    }
  };

  if (plan.status !== 'active') {
    if (plan.status === 'completed') {
      return (
        <div className="pt-2 mt-2 border-t border-border/50 text-xs text-green-600 dark:text-green-400 font-medium">
          ✓ Plan completed
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex gap-1.5 pt-2 mt-2 border-t border-border/50 relative">
      <button
        onClick={handleCancel}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-elevated-2 text-fg-muted hover:text-fg transition-colors"
        aria-label="Cancel plan"
      >
        <X className="h-3 w-3" />
        Cancel
      </button>

      {/* Revision Badge - Show if plan was revised */}
      {plan.version > 1 && plan.revisions.length > 0 && (
        <button
          onClick={onShowRevisions}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-accent/20 border border-accent/30 bg-accent/10 text-accent transition-colors"
          aria-label="View revision details"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Revised (v{plan.version})</span>
        </button>
      )}
    </div>
  );
}
