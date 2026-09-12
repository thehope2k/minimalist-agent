// Multi-phase plan/approval state (CreatePlan / RequestDecision-style
// planning workflow), fully self-contained aside from a read-only need to
// resolve "which turnId does this plan anchor to" from the shared message
// store.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/lib/logger';
import type { ChatMessage } from '@/lib/chat';
import type { Phase, Plan } from '@/lib/electron';

const log = createLogger('useChat:plan');

export interface PlanStateStoreDeps {
  messagesBySession: React.MutableRefObject<Map<string, ChatMessage[]>>;
  streamingBySession: React.MutableRefObject<Map<string, { turnId: string }>>;
}

export function usePlanState(activeSessionId: string | null, deps: PlanStateStoreDeps) {
  const { messagesBySession, streamingBySession } = deps;

  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [showPhaseApproval, setShowPhaseApproval] = useState(false);
  const [phaseAwaitingApproval, setPhaseAwaitingApproval] = useState<Phase | null>(null);
  const [planError, setPlanError] = useState<{ message: string; phaseId?: string; recoverable: boolean; suggestedAction?: string } | null>(null);

  const activePlanBySession = useRef<Map<string, Plan>>(new Map());
  const planAnchorTurnBySession = useRef<Map<string, string>>(new Map());

  // Mirrors the main hook's own activeSessionIdRef pattern: cheap to keep in
  // sync every render, and avoids plan-event handlers closing over a stale
  // activeSessionId from the render they were created in.
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const findLastAssistantTurnId = useCallback((sid: string): string | null => {
    const bucket = messagesBySession.current.get(sid) ?? [];
    for (let i = bucket.length - 1; i >= 0; i--) {
      const msg = bucket[i];
      if (msg.role === 'assistant' && msg.markerKind !== 'compaction') {
        return msg.id;
      }
    }
    return null;
  }, [messagesBySession]);

  const resolvePlanAnchorTurnId = useCallback((sid: string): string | null => {
    const fromStream = streamingBySession.current.get(sid)?.turnId;
    if (fromStream) return fromStream;
    return findLastAssistantTurnId(sid);
  }, [findLastAssistantTurnId, streamingBySession]);

  /** Sets (or clears, on `plan: null`) the cached plan for a session id and
   *  updates the visible `activePlan` state if that session is on screen. */
  const setSessionPlan = useCallback((sid: string, plan: Plan | null, options?: { resetAnchor?: boolean }) => {
    if (!plan) {
      activePlanBySession.current.delete(sid);
      planAnchorTurnBySession.current.delete(sid);
      if (sid === activeSessionIdRef.current) {
        setActivePlan(null);
      }
      return;
    }

    activePlanBySession.current.set(sid, plan);

    if (plan.anchorTurnId) {
      planAnchorTurnBySession.current.set(sid, plan.anchorTurnId);
    }

    if (options?.resetAnchor) {
      planAnchorTurnBySession.current.delete(sid);
      const anchor = resolvePlanAnchorTurnId(sid);
      if (anchor) {
        planAnchorTurnBySession.current.set(sid, anchor);
      }
    }

    if (sid === activeSessionIdRef.current) {
      setActivePlan(plan);
    }
  }, [resolvePlanAnchorTurnId]);

  const getPlanForMessage = useCallback((sid: string | null | undefined, messageId: string): Plan | null => {
    if (!sid) return null;
    const plan = activePlanBySession.current.get(sid);
    if (!plan) return null;

    if (plan.status === 'active') {
      // Active plans follow the latest assistant bubble in real time.
      const liveAnchor = resolvePlanAnchorTurnId(sid);
      if (!liveAnchor) return null;
      planAnchorTurnBySession.current.set(sid, liveAnchor);
      return liveAnchor === messageId ? plan : null;
    }

    // Terminal plans stay at their persisted creation anchor. Older plans
    // lack that field, so retain a latest-assistant fallback for compatibility.
    const frozenAnchor = planAnchorTurnBySession.current.get(sid) ?? findLastAssistantTurnId(sid);
    if (!frozenAnchor || frozenAnchor !== messageId) return null;
    return plan;
  }, [resolvePlanAnchorTurnId]);

  /** Repaints `activePlan` from the cache for the now-visible session,
   *  without touching the cache itself. Called synchronously from
   *  useChat's own session-switch effect (same batch as the message-state
   *  updates) so the plan banner and the message list never disagree about
   *  which session they're showing — unlike a separate effect keyed on
   *  `activeSessionId`, which would commit one render behind. */
  const syncVisiblePlan = useCallback((sid: string | null) => {
    setActivePlan(sid ? activePlanBySession.current.get(sid) ?? null : null);
  }, []);

  // Listen for planning workflow events
  useEffect(() => {
    if (!window.api?.planning) return;

    const unsubCreated = window.api.planning.onPlanCreated((sid: string, plan: Plan) => {
      setSessionPlan(sid, plan, { resetAnchor: true });
    });

    const unsubUpdated = window.api.planning.onPlanUpdated((sid: string, plan: Plan) => {
      setSessionPlan(sid, plan);
    });

    const unsubPhaseUpdated = window.api.planning.onPhaseUpdated((sid: string, planId: string, phase: Phase) => {
      const current = activePlanBySession.current.get(sid);
      if (!current || current.id !== planId) return;
      const updated = { ...current, phases: [...current.phases] };
      const index = updated.phases.findIndex((p) => p.id === phase.id);
      if (index < 0) return;
      updated.phases[index] = phase;
      setSessionPlan(sid, updated);
    });

    const unsubRevised = window.api.planning.onPlanRevised((sid: string, plan: Plan) => {
      setSessionPlan(sid, plan);
    });

    const unsubCompleted = window.api.planning.onPlanCompleted((sid: string, planId: string) => {
      const current = activePlanBySession.current.get(sid);
      if (!current || current.id !== planId) return;
      const finalAnchor = resolvePlanAnchorTurnId(sid);
      if (finalAnchor) {
        planAnchorTurnBySession.current.set(sid, finalAnchor);
      }
      setSessionPlan(sid, { ...current, status: 'completed' });
    });

    const unsubCancelled = window.api.planning.onPlanCancelled((sid: string, planId: string) => {
      const current = activePlanBySession.current.get(sid);
      if (current && current.id !== planId) return;
      setSessionPlan(sid, null);
      if (sid === activeSessionIdRef.current) {
        setShowPhaseApproval(false);
        setPhaseAwaitingApproval(null);
      }
    });

    const unsubError = window.api.planning.onPlanError((sid: string, planId: string, error: string, phaseId?: string) => {
      const current = activePlanBySession.current.get(sid);
      if (!current || current.id !== planId) return;
      const finalAnchor = resolvePlanAnchorTurnId(sid);
      if (finalAnchor) {
        planAnchorTurnBySession.current.set(sid, finalAnchor);
      }
      setSessionPlan(sid, { ...current, status: 'error' });
      if (sid === activeSessionIdRef.current) {
        setPlanError({
          message: error,
          phaseId,
          recoverable: true,
          suggestedAction: 'Review the error and choose a recovery action.',
        });
      }
    });

    const unsubApprovalRequired = window.api.planning.onApprovalRequired((sid: string, planId: string, phase: Phase) => {
      const current = activePlanBySession.current.get(sid);
      if (!current || current.id !== planId) return;

      if (sid === activeSessionIdRef.current) {
        setPhaseAwaitingApproval(phase);
        setShowPhaseApproval(true);
      }
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubPhaseUpdated();
      unsubRevised();
      unsubCompleted();
      unsubCancelled();
      unsubError();
      unsubApprovalRequired();
    };
  }, [resolvePlanAnchorTurnId, setSessionPlan]);

  // Load active plan on session change.
  useEffect(() => {
    setShowPhaseApproval(false);
    setPhaseAwaitingApproval(null);
    if (!activeSessionId || !window.api?.planning) return;

    window.api.planning.getActivePlan(activeSessionId)
      .then((plan: Plan | null) => {
        setSessionPlan(activeSessionId, plan);
        if (activeSessionIdRef.current !== activeSessionId) return;
        const awaitingPhase = plan?.phases.find((phase) => phase.approvalStatus === 'awaiting');
        if (awaitingPhase) {
          setPhaseAwaitingApproval(awaitingPhase);
          setShowPhaseApproval(true);
        }
      })
      .catch((err) => log.error('Failed to load active plan:', err));
  }, [activeSessionId, setSessionPlan]);

  return {
    activePlan,
    getPlanForMessage,
    showPhaseApproval,
    phaseAwaitingApproval,
    planError,
    setShowPhaseApproval,
    setPhaseAwaitingApproval,
    setPlanError,
    /** Repaints activePlan from cache for a given session id — call this
     *  synchronously alongside message-state updates on every session
     *  switch (see useChat.ts's session-switch effect). */
    syncVisiblePlan,
    /** Exposed for the one remaining external call site: the session-switch
     *  effect's "no data on disk" branch, which must clear a stale cached
     *  plan for a session that turned out to have no stored messages. */
    setSessionPlan,
  };
}
