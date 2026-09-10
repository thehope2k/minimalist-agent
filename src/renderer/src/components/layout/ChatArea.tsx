import { useEffect } from 'react';
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
import { usePlanActions } from './chat-area/usePlanActions';
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
    projectDefaultModel,
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

  // Plan-execution actions: Continue/Retry connection-model resolution,
  // and phase approve/deny/retry/skip/cancel handlers.
  const {
    handleContinue,
    handleRetry,
    onApprovePhase,
    onDenyPhase,
    onRetryPhase,
    onSkipPhase,
    onCancelPlan,
  } = usePlanActions({
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
  });

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
          projectDefaultModel={projectDefaultModel}
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
