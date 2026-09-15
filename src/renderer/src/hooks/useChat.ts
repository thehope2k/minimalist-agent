import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/chat';
import type { CompactionNotice } from './chat/types';
import { useSessionStore } from './chat/session-store';
import { usePlanState } from './chat/use-plan-state';
import { useCheckpoints } from './chat/use-checkpoints';
import { useAutoTitle } from './chat/use-auto-title';
import { useSessionLoader } from './chat/use-session-loader';
import { useChatEventListener } from './chat/use-chat-event-listener';
import { useChatRetry, useChatSend, useChatStreamControls } from './chat/use-chat-actions';

export type { CompactionNotice };


export function useChat(
  sessionId: string | null,
  defaultProjectIdForNewSession?: string | null,
) {
  const defaultProjectIdRef = useRef<string | null | undefined>(
    defaultProjectIdForNewSession,
  );
  defaultProjectIdRef.current = defaultProjectIdForNewSession;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  /** turnId of the in-flight send for the *visible* session. */
  const [streamingTurnId, setStreamingTurnId] = useState<string | null>(null);
  const [lastCompaction, setLastCompaction] = useState<CompactionNotice | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId);
  /**
   * State-backed mirror of `streamingBySession`'s key set. Lets consumers
   * (e.g. SessionsPanel) render a "running" indicator on every session that
   * has an active turn, regardless of which one the user is viewing.
   */
  const [streamingSessionIds, setStreamingSessionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  /**
   * All chat state is keyed by app session id. Streaming events from main
   * route into the right bucket via {@link turnIdToSession}, so a session
   * can keep streaming in the background while the user views another.
   */
  const store = useSessionStore();
  const {
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    runtimeSessionIdBySession,
    titleBySession,
    lastSendBySession,
    seenCompactionEvents,
  } = store;

  // Planning workflow state (session-scoped source of truth inside the hook).
  const plan = usePlanState(activeSessionId, { messagesBySession, streamingBySession });

  const { maybeAutoGenerateTitle } = useAutoTitle({
    messagesBySession,
    lastSendBySession,
    titleBySession,
  });

  /**
   * Closure-stable mirror for the chat-event listener. The listener
   * subscribes once at mount and routes events into the right bucket
   * regardless of which session is currently visible.
   */
  const activeSessionIdRef = useRef<string | null>(sessionId);
  activeSessionIdRef.current = activeSessionId;

  /** Force a re-render so retry-state pills can refresh on demand. */
  const [, bump] = useState(0);
  const forceRerender = useCallback(() => bump((n) => n + 1), []);

  /**
   * Snapshot the current keys of `streamingBySession` into a fresh Set so
   * the React-tracked `streamingSessionIds` state notifies subscribers.
   * Call this at every mutation site of `streamingBySession.current`.
   */
  const syncStreamingIds = useCallback(() => {
    setStreamingSessionIds(new Set(streamingBySession.current.keys()));
  }, []);

  const { scheduleCheckpoint, cancelPendingCheckpoint } = useCheckpoints({
    messagesBySession,
    streamingBySession,
  });

  useSessionLoader({
    sessionId,
    messagesBySession,
    streamingBySession,
    runtimeSessionIdBySession,
    titleBySession,
    seenCompactionEvents,
    setActiveSessionId,
    setLastCompaction,
    setMessages,
    setIsStreaming,
    setStreamingTurnId,
    plan,
  });

  useChatEventListener({
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    runtimeSessionIdBySession,
    titleBySession,
    seenCompactionEvents,
    activeSessionIdRef,
    setMessages,
    setIsStreaming,
    setStreamingTurnId,
    setLastCompaction,
    syncStreamingIds,
    scheduleCheckpoint,
    cancelPendingCheckpoint,
    maybeAutoGenerateTitle,
  });

  const { send } = useChatSend({
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    titleBySession,
    lastSendBySession,
    activeSessionIdRef,
    defaultProjectIdRef,
    setActiveSessionId,
    setMessages,
    setIsStreaming,
    setStreamingTurnId,
    syncStreamingIds,
    forceRerender,
  });

  const { steer, triggerManualCompaction, abort } = useChatStreamControls({
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    activeSessionIdRef,
    setMessages,
    setIsStreaming,
    setStreamingTurnId,
    syncStreamingIds,
  });

  const { retry } = useChatRetry({
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    lastSendBySession,
    activeSessionIdRef,
    setMessages,
    setIsStreaming,
    setStreamingTurnId,
    syncStreamingIds,
    send,
  });

  // Hot-path retry — true when the visible session has captured SendArgs
  // from a prior `send()` in this app run. The cold path (post-reload
  // interrupted turn) requires caller-supplied fallback args and is
  // surfaced via `errorInfo.canRetry` on the message itself, not this flag.
  const canRetry =
    !!activeSessionId &&
    lastSendBySession.current.has(activeSessionId) &&
    !streamingBySession.current.has(activeSessionId);

  return {
    messages,
    isStreaming,
    streamingTurnId,
    streamingSessionIds,
    activeSessionId,
    send,
    abort,
    retry,
    steer,
    triggerManualCompaction,
    canRetry,
    lastCompaction,
    // Planning workflow state
    activePlan: plan.activePlan,
    getPlanForMessage: plan.getPlanForMessage,
    showPhaseApproval: plan.showPhaseApproval,
    phaseAwaitingApproval: plan.phaseAwaitingApproval,
    planError: plan.planError,
    setShowPhaseApproval: plan.setShowPhaseApproval,
    setPhaseAwaitingApproval: plan.setPhaseAwaitingApproval,
    setPlanError: plan.setPlanError,
  };
}
