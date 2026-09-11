// Plan-execution action handlers: resolving the connection/model to use for
// agent-initiated turns (Continue, Retry, and plan-phase resume), and the
// phase approval/deny/retry/skip/cancel handlers wired into PlanningDialogs.
//
// Approving/denying a phase only updates plan state on its own — the agent's
// turn already ended when ReportPhaseProgress told it to wait, and nothing
// else nudges it forward. So resumePlanAfterDecision below immediately kicks
// off a fresh turn (same path as the "Continue" button) telling the model
// what the user decided, using the same connection/model resolution
// `handleContinue` uses so it doesn't fall back to defaults mid-plan.
import { useCallback, useEffect, useRef } from 'react';
import { homedir } from '@/lib/path';
import type { SendArgs } from '@/hooks/chat/types';
import type { ConnectionMeta, PermissionMode, Phase } from '@/lib/electron';
import type { useAiData } from '@/hooks/useAiData';

type AiData = ReturnType<typeof useAiData>;

type PlanError = {
  message: string;
  phaseId?: string;
  recoverable: boolean;
  suggestedAction?: string;
};

export function usePlanActions(args: {
  aiData: AiData;
  sessionConnectionSlug: string | undefined;
  sessionModel: string | undefined;
  cwd: string | undefined;
  permissionMode: PermissionMode;
  isStreaming: boolean;
  send: (args: SendArgs) => Promise<void>;
  retry: (fallback?: {
    connection: ConnectionMeta;
    model: string;
    cwd?: string;
    permissionMode: PermissionMode;
  }) => Promise<void>;
  sessionId: string | null;
  activeSessionId: string | null;
  phaseAwaitingApproval: Phase | null;
  setShowPhaseApproval: (v: boolean) => void;
  setPhaseAwaitingApproval: (v: Phase | null) => void;
  planError: PlanError | null;
  setPlanError: (v: PlanError | null) => void;
}) {
  const {
    aiData,
    sessionConnectionSlug,
    sessionModel,
    cwd,
    permissionMode,
    isStreaming,
    send,
    retry,
    sessionId,
    activeSessionId,
    phaseAwaitingApproval,
    setShowPhaseApproval,
    setPhaseAwaitingApproval,
    planError,
    setPlanError,
  } = args;

  // Extracted so the plan-approval auto-continue below can't drift from
  // what the ordinary "Continue" button already established.
  const resolveSessionConnectionModel = useCallback(() => {
    if (!aiData) return null;
    const connection =
      aiData.connections.find((c) => c.slug === sessionConnectionSlug) ??
      aiData.connections.find((c) => c.slug === aiData.defaultSlug) ??
      aiData.connections[0];
    if (!connection) return null;
    const model =
      sessionModel ||
      connection.models.find((m) => m.id === aiData.settings.defaultModel)?.id ||
      connection.defaultModel;
    return { connection, model };
  }, [aiData, sessionConnectionSlug, sessionModel]);

  const handleContinue = useCallback(() => {
    const resolved = resolveSessionConnectionModel();
    if (!resolved) return;
    void send({
      text: 'continue',
      connection: resolved.connection,
      model: resolved.model,
      cwd: cwd ?? (homedir() || undefined),
      permissionMode,
    });
  }, [resolveSessionConnectionModel, aiData, send, cwd, permissionMode]);

  // Retry handler with fallback reconstruction
  const handleRetry = useCallback(() => {
    const resolved = resolveSessionConnectionModel();
    if (!resolved) return void retry();
    void retry({
      connection: resolved.connection,
      model: resolved.model,
      cwd: cwd ?? (homedir() || undefined),
      permissionMode,
    });
  }, [resolveSessionConnectionModel, aiData, retry, cwd, permissionMode]);

  const fireResumeAfterDecision = useCallback(
    (decision: 'approved' | 'denied', phaseLabel: string, note?: string) => {
      const resolved = resolveSessionConnectionModel();
      if (!resolved) return;
      const text =
        decision === 'approved'
          ? `Phase ${phaseLabel} approved${note ? ` (note: ${note})` : ''}. Continue executing the plan.`
          : `Phase ${phaseLabel} was denied${note ? `: ${note}` : ''}. Skip it and continue with the plan, or ask how to proceed if it was critical.`;
      void send({
        text,
        connection: resolved.connection,
        model: resolved.model,
        cwd: cwd ?? (homedir() || undefined),
        permissionMode,
      });
    },
    [resolveSessionConnectionModel, send, cwd, aiData, permissionMode],
  );

  // Holds a decision made while a turn was still streaming. `send()` has no
  // concurrency guard, so we can't fire immediately — and the model is
  // explicitly told it may keep working on other tasks while a phase awaits
  // approval, so an in-flight turn at decision time is the common case, not
  // an edge case. Dropping it here would silently reproduce the exact stall
  // this mechanism exists to fix, just in a narrower window — so queue it and
  // flush it the moment the in-flight turn ends (see the effect below).
  const pendingPlanResumeRef = useRef<{
    decision: 'approved' | 'denied';
    phaseLabel: string;
    note?: string;
  } | null>(null);

  const resumePlanAfterDecision = useCallback(
    (decision: 'approved' | 'denied', phaseLabel: string, note?: string) => {
      if (isStreaming) {
        pendingPlanResumeRef.current = { decision, phaseLabel, note };
        return;
      }
      fireResumeAfterDecision(decision, phaseLabel, note);
    },
    [isStreaming, fireResumeAfterDecision],
  );

  useEffect(() => {
    if (isStreaming) return;
    const pending = pendingPlanResumeRef.current;
    if (!pending) return;
    pendingPlanResumeRef.current = null;
    fireResumeAfterDecision(pending.decision, pending.phaseLabel, pending.note);
  }, [isStreaming, fireResumeAfterDecision]);

  const onApprovePhase = async (notes?: string) => {
    if (sessionId && phaseAwaitingApproval) {
      await window.api.planning.approvePhase(sessionId, phaseAwaitingApproval.id, notes);
      resumePlanAfterDecision('approved', `${phaseAwaitingApproval.index}`, notes);
    }
    setShowPhaseApproval(false);
    setPhaseAwaitingApproval(null);
  };

  const onDenyPhase = async (reason?: string) => {
    if (sessionId && phaseAwaitingApproval) {
      await window.api.planning.denyPhase(sessionId, phaseAwaitingApproval.id, reason);
      resumePlanAfterDecision('denied', `${phaseAwaitingApproval.index}`, reason);
    }
    setShowPhaseApproval(false);
    setPhaseAwaitingApproval(null);
  };

  const onRetryPhase = async () => {
    if (activeSessionId && planError?.phaseId) {
      await window.api.planning.retryPhase(activeSessionId, planError.phaseId);
    }
    setPlanError(null);
  };

  const onSkipPhase = async () => {
    if (activeSessionId && planError?.phaseId) {
      await window.api.planning.skipPhase(activeSessionId, planError.phaseId);
    }
    setPlanError(null);
  };

  const onCancelPlan = async () => {
    if (activeSessionId) {
      await window.api.planning.cancelPlan(activeSessionId);
    }
    setPlanError(null);
  };

  return {
    handleContinue,
    handleRetry,
    onApprovePhase,
    onDenyPhase,
    onRetryPhase,
    onSkipPhase,
    onCancelPlan,
  };
}
