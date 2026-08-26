import { useEffect, useCallback, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useAiData } from '@/hooks/useAiData';
import { useProjects } from '@/hooks/useProjects';
import { setSessionPermissionMode, setSessionAutonomyLevel, setSessionThinkingLevel } from '@/lib/sessions';
import { homedir } from '@/lib/path';
import { ChatHeader } from './chat-area/ChatHeader';
import { ChatContent } from './chat-area/ChatContent';
import { ChatModals } from './chat-area/ChatModals';
import { PlanningDialogs } from './chat-area/PlanningDialogs';
import { useSessionSync } from './chat-area/useSessionSync';
import { useSeedSubmit } from './chat-area/useSeedSubmit';
import { useBranchSession } from './chat-area/useBranchSession';
import { useKeyboardShortcuts } from './chat-area/useKeyboardShortcuts';
import type { ChatAreaProps } from './chat-area/types';

export type { ChatAreaProps as Props };
export type { SeedSubmit } from './chat-area/types';

/**
 * Chat area orchestrator. Manages session lifecycle, streaming control,
 * planning dialogs, modals, and keyboard shortcuts.
 */
export function ChatArea({
  sessionId,
  onSessionCreated,
  onNewSession,
  seedSubmit,
  onSeedSubmitConsumed,
  newSessionDefaultProjectId,
  onStreamingChange,
  onCwdChange,
  shortcutsEnabled = true,
  onOpenFile,
  onToggleFileExplorer,
  fileExplorerOpen,
  onToggleContextPanel,
}: ChatAreaProps) {
  const {
    messages,
    isStreaming,
    streamingTurnId,
    streamingSessionIds,
    send,
    abort,
    retry,
    steer,
    triggerManualCompaction,
    activeSessionId,
    lastCompaction,
    activePlan,
    getPlanForMessage,
    showPhaseApproval,
    phaseAwaitingApproval,
    showPlanRevision,
    latestRevision,
    planError,
    setShowPhaseApproval,
    setPhaseAwaitingApproval,
    setShowPlanRevision,
    setPlanError,
  } = useChat(sessionId, newSessionDefaultProjectId);

  const aiData = useAiData();
  useProjects(); // Bootstrap project store

  // Session metadata sync (CWD, title, permission mode, etc.)
  const {
    cwd,
    setCwd,
    title,
    permissionMode,
    setPermissionMode,
    autonomyLevel,
    setAutonomyLevel,
    thinkingLevel,
    setThinkingLevel,
    projectDefaultConnectionSlug,
    sessionConnectionSlug,
    sessionModel,
    loadedSessionPickId,
    permissionModeRef,
    autonomyLevelRef,
  } = useSessionSync(sessionId, newSessionDefaultProjectId, aiData, onCwdChange);

  // Branch session logic
  const { pendingMessage, setPendingMessage, handleBranch } = useBranchSession(
    sessionId,
    messages,
    onSessionCreated,
  );

  // Keyboard shortcuts (Git, Search, Recent Files, Find in Chat)
  const activeSession = activeSessionId ?? sessionId;
  const {
    gitModalOpen,
    setGitModalOpen,
    searchOpen,
    setSearchOpen,
    recentOpen,
    setRecentOpen,
    findOpen,
    setFindOpen,
    findInputRef,
  } = useKeyboardShortcuts(shortcutsEnabled, activeSession, cwd);

  // Auto-send seeded submissions (e.g. New Skill)
  useSeedSubmit(
    seedSubmit,
    onSeedSubmitConsumed,
    aiData,
    isStreaming,
    messages,
    cwd,
    permissionMode,
    send,
  );

  // Cheap content-changed signal for ChatScroll
  const last = messages[messages.length - 1];
  const lastTextLen = last
    ? last.parts.reduce(
        (n, p) =>
          p.kind === 'text' || p.kind === 'thinking' ? n + p.text.length : n + 1,
        0,
      )
    : 0;
  const contentSignal = messages.length * 10_000 + lastTextLen;

  // Notify App when activeSessionId changes
  useEffect(() => {
    if (activeSessionId && activeSessionId !== sessionId) {
      onSessionCreated(activeSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Notify App of streaming session changes
  useEffect(() => {
    onStreamingChange?.(streamingSessionIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingSessionIds]);

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
      maxTurns: aiData?.settings.maxTurns,
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
      maxTurns: aiData?.settings.maxTurns,
      permissionMode,
    });
  }, [resolveSessionConnectionModel, aiData, retry, cwd, permissionMode]);

  // Approving/denying a phase only updates plan state — the agent's turn
  // already ended when ReportPhaseProgress told it to wait, and nothing else
  // nudges it forward. Without this, the plan silently stalls until the user
  // happens to type another message. So immediately after resolving the
  // approval, kick off a fresh turn (same path as the "Continue" button) that
  // tells the model what the user decided, using the same connection/model
  // resolution `handleContinue` uses so it doesn't fall back to defaults
  // mid-plan.
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
        maxTurns: aiData?.settings.maxTurns,
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

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <ChatHeader
        title={title}
        sessionId={activeSession}
        onNewSession={onNewSession}
        onOpenGit={() => setGitModalOpen(true)}
        onToggleFileExplorer={onToggleFileExplorer}
        fileExplorerOpen={fileExplorerOpen}
        onToggleContextPanel={onToggleContextPanel}
        cwd={cwd}
      />

      <div className="flex-1 min-h-0">
        <ChatContent
          sessionId={sessionId}
          activeSessionId={activeSessionId}
          messages={messages}
          isStreaming={isStreaming}
          streamingTurnId={streamingTurnId}
          contentSignal={contentSignal}
          cwd={cwd}
          setCwd={setCwd}
          permissionMode={permissionMode}
          setPermissionMode={(mode) => {
            setPermissionMode(mode);
            permissionModeRef.current = mode;
            if (activeSessionId) {
              void setSessionPermissionMode(activeSessionId, mode);
            }
          }}
          autonomyLevel={autonomyLevel}
          setAutonomyLevel={(level) => {
            setAutonomyLevel(level);
            autonomyLevelRef.current = level;
            if (activeSessionId) {
              void setSessionAutonomyLevel(activeSessionId, level);
            }
          }}
          thinkingLevel={thinkingLevel}
          setThinkingLevel={(level) => {
            setThinkingLevel(level);
            if (activeSessionId) {
              void setSessionThinkingLevel(activeSessionId, level);
            }
          }}
          title={title}
          lastCompaction={lastCompaction}
          projectDefaultConnectionSlug={projectDefaultConnectionSlug}
          sessionConnectionSlug={sessionConnectionSlug}
          sessionModel={sessionModel}
          loadedSessionPickId={loadedSessionPickId}
          pendingMessage={pendingMessage}
          onPendingMessageConsumed={() => setPendingMessage(undefined)}
          onSend={(args) => send({ ...args, cwd: cwd ?? (homedir() || undefined) })}
          onAbort={abort}
          onSteer={steer}
          onManualCompact={triggerManualCompaction}
          onRetry={handleRetry}
          onContinue={handleContinue}
          onBranch={(id, withContext) => void handleBranch(id, withContext)}
          getPlanForMessage={getPlanForMessage}
          findOpen={findOpen}
          onFindClose={() => setFindOpen(false)}
          findInputRef={findInputRef}
          onOpenFile={onOpenFile}
        />
      </div>

      <ChatModals
        gitModalOpen={gitModalOpen}
        searchOpen={searchOpen}
        recentOpen={recentOpen}
        cwd={cwd}
        sessionConnectionSlug={sessionConnectionSlug}
        sessionModel={sessionModel}
        activeSession={activeSession}
        onCloseGit={() => setGitModalOpen(false)}
        onCloseSearch={() => setSearchOpen(false)}
        onCloseRecent={() => setRecentOpen(false)}
        onOpenFile={onOpenFile}
      />

      <PlanningDialogs
        sessionId={sessionId}
        showPhaseApproval={showPhaseApproval}
        phaseAwaitingApproval={phaseAwaitingApproval}
        showPlanRevision={showPlanRevision}
        latestRevision={latestRevision}
        planError={planError}
        activePlan={activePlan}
        activeSessionId={activeSessionId}
        onApprovePhase={onApprovePhase}
        onDenyPhase={onDenyPhase}
        onDismissRevision={() => setShowPlanRevision(false)}
        onRetryPhase={onRetryPhase}
        onSkipPhase={onSkipPhase}
        onCancelPlan={onCancelPlan}
        onDismissError={() => setPlanError(null)}
      />
    </main>
  );
}
