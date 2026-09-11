import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { Plan } from '@/lib/electron';
import { RevisionPopover } from './RevisionPopover';

interface ActionButtonsProps {
  sessionId: string;
  plan: Plan;
}

export function ActionButtons({ sessionId, plan }: ActionButtonsProps) {
  const hasRevisions = plan.version > 1 && plan.revisions.length > 0;

  const handleCancel = async () => {
    if (confirm('Cancel this plan? Execution will stop.')) {
      await window.api.planning.cancelPlan(sessionId);
    }
  };

  if (plan.status !== 'active' && plan.status !== 'completed' && !hasRevisions) {
    return null;
  }

  return (
    <div className="mt-2 flex min-h-8 items-center gap-1.5 border-t border-border/50 pt-2">
      {plan.status === 'completed' && (
        <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-green-600 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          Plan completed
        </div>
      )}

      {plan.status === 'active' && (
        <Button
          variant="ghost"
          size="sm"
          icon={X}
          onClick={handleCancel}
          aria-label="Cancel plan"
        >
          Cancel
        </Button>
      )}

      {hasRevisions && (
        <div className="ml-auto">
          <RevisionPopover plan={plan} />
        </div>
      )}
    </div>
  );
}
