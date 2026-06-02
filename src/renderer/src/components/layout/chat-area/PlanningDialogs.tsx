import { PhaseApprovalDialog } from '@/components/chat/PhaseApprovalDialog';
import { PlanRevisionNotification } from '@/components/chat/PlanRevisionNotification';
import { PlanErrorNotification } from '@/components/chat/PlanErrorNotification';
import type { Phase, PlanRevision, Plan } from '@/lib/electron';

type PlanError = {
  message: string;
  phaseId?: string;
  recoverable: boolean;
  suggestedAction?: string;
};

type Props = {
  sessionId: string | null;
  showPhaseApproval: boolean;
  phaseAwaitingApproval: Phase | null;
  showPlanRevision: boolean;
  latestRevision: PlanRevision | null;
  planError: PlanError | null;
  activePlan: any;
  activeSessionId: string | null;
  onApprovePhase: (notes?: string) => Promise<void>;
  onDenyPhase: (reason?: string) => Promise<void>;
  onDismissRevision: () => void;
  onRetryPhase: () => Promise<void>;
  onSkipPhase: () => Promise<void>;
  onCancelPlan: () => Promise<void>;
  onDismissError: () => void;
};

export function PlanningDialogs({
  sessionId,
  showPhaseApproval,
  phaseAwaitingApproval,
  showPlanRevision,
  latestRevision,
  planError,
  activePlan,
  activeSessionId,
  onApprovePhase,
  onDenyPhase,
  onDismissRevision,
  onRetryPhase,
  onSkipPhase,
  onCancelPlan,
  onDismissError,
}: Props) {
  return (
    <>
      {showPhaseApproval && phaseAwaitingApproval && (
        <PhaseApprovalDialog
          phase={phaseAwaitingApproval}
          onApprove={onApprovePhase}
          onDeny={onDenyPhase}
        />
      )}

      {showPlanRevision && latestRevision && (
        <PlanRevisionNotification
          revision={latestRevision}
          onDismiss={onDismissRevision}
        />
      )}

      {planError && activePlan && (
        <PlanErrorNotification
          error={planError}
          onRetry={onRetryPhase}
          onSkip={onSkipPhase}
          onCancel={onCancelPlan}
          onDismiss={onDismissError}
        />
      )}
    </>
  );
}
