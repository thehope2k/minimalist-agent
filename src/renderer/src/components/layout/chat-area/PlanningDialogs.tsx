import { PhaseApprovalDialog } from '@/components/chat/PhaseApprovalDialog';
import { PlanErrorNotification } from '@/components/chat/PlanErrorNotification';
import type { Phase, Plan } from '@/lib/electron';

type PlanError = {
  message: string;
  phaseId?: string;
  recoverable: boolean;
  suggestedAction?: string;
};

type Props = {
  showPhaseApproval: boolean;
  phaseAwaitingApproval: Phase | null;
  planError: PlanError | null;
  activePlan: Plan | null;
  onApprovePhase: (notes?: string) => Promise<void>;
  onDenyPhase: (reason?: string) => Promise<void>;
  onRetryPhase: () => Promise<void>;
  onSkipPhase: () => Promise<void>;
  onCancelPlan: () => Promise<void>;
  onDismissError: () => void;
};

export function PlanningDialogs({
  showPhaseApproval,
  phaseAwaitingApproval,
  planError,
  activePlan,
  onApprovePhase,
  onDenyPhase,
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
