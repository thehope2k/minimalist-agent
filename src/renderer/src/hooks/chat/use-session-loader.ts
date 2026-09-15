import { useEffect } from 'react';
import { chatFromStored, chatToStored, partsToContent, type ChatMessage } from '@/lib/chat';
import { loadFullSession, replaceLastMessage } from '@/lib/sessions';
import type { AgentError } from '@/lib/electron';
import type { CompactionNotice } from './types';
import type { SessionStore } from './session-store';

interface SessionPlanSync {
  syncVisiblePlan: (sessionId: string | null) => void;
  setSessionPlan: (sessionId: string, plan: null) => void;
}

interface SessionLoaderDeps extends Pick<
  SessionStore,
  | 'messagesBySession'
  | 'streamingBySession'
  | 'runtimeSessionIdBySession'
  | 'titleBySession'
  | 'seenCompactionEvents'
> {
  sessionId: string | null;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setLastCompaction: React.Dispatch<React.SetStateAction<CompactionNotice | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingTurnId: React.Dispatch<React.SetStateAction<string | null>>;
  plan: SessionPlanSync;
}

export function useSessionLoader(deps: SessionLoaderDeps): void {
  const {
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
  } = deps;

  // Session-switch: render the bucket if cached, else load from disk.
  useEffect(() => {
    setActiveSessionId(sessionId);
    // A running/finished compaction toast is per-session; don't let a stale
    // one from the previously viewed session bleed into this one.
    setLastCompaction(null);
    if (!sessionId) {
      setMessages([]);
      setIsStreaming(false);
      setStreamingTurnId(null);
      plan.syncVisiblePlan(null);
      return;
    }

    // Fresh `send()` may have just primed this bucket — never clobber it
    // with a disk read (the assistant message is mid-stream and won't be
    // persisted until `turn_done`).
    const cached = messagesBySession.current.get(sessionId);
    if (cached) {
      setMessages(cached);
      const stream = streamingBySession.current.get(sessionId);
      setIsStreaming(!!stream);
      setStreamingTurnId(stream?.turnId ?? null);
      plan.syncVisiblePlan(sessionId);
      return;
    }

    let cancelled = false;
    loadFullSession(sessionId).then((data) => {
      if (cancelled) return;
      if (!data) {
        messagesBySession.current.set(sessionId, []);
        setMessages([]);
        setIsStreaming(false);
        setStreamingTurnId(null);
        plan.setSessionPlan(sessionId, null);
        return;
      }
      let msgs = data.messages.map(chatFromStored);

      // Populate deduplication set from loaded compaction markers to prevent
      // creating duplicates if the same turn triggers compaction again.
      for (const msg of msgs) {
        if (msg.markerKind === 'compaction' && msg.compactionMeta) {
          // Find the assistant message this marker is associated with.
          // It should be right before the marker in the list.
          const idx = msgs.indexOf(msg);
          const prevMsg = idx > 0 ? msgs[idx - 1] : null;
          if (prevMsg && prevMsg.role === 'assistant') {
            const key = `${sessionId}:${prevMsg.id}:${msg.compactionMeta.status ?? 'success'}:${msg.compactionMeta.preTokens}`;
            seenCompactionEvents.current.add(key);
          }
        }
      }

      // Recovery: if the trailing assistant message is a "zombie" (no
      // stop reason, no error info — the turn never reached `turn_done`),
      // mark it interrupted so the user sees a Retry button. This catches
      // app-killed-mid-turn cases that the debounced checkpoint missed.
      const last = msgs[msgs.length - 1];
      if (
        last &&
        last.role === 'assistant' &&
        !last.stopReason &&
        !last.errorInfo &&
        !last.error &&
        !streamingBySession.current.has(sessionId)
      ) {
        const errInfo: AgentError = {
          code: 'unknown_error',
          title: 'Turn was interrupted',
          message:
            'The previous turn did not finish — the app was closed or the connection dropped before completion. Click Retry to run it again.',
          canRetry: true,
        };
        const fixed: ChatMessage = {
          ...last,
          isStreaming: false,
          stopReason: 'aborted',
          errorInfo: errInfo,
          error: errInfo.message,
        };
        msgs = [...msgs.slice(0, -1), fixed];
        // Persist the recovery so the disk reflects the same state on next
        // load and downstream readers (e.g. title gen) see a closed turn.
        const stored = chatToStored(fixed);
        // Preserve the original createdAt so replaceLastMessage does not bump
        // meta.lastMessageAt to Date.now(), which would re-sort the session list
        // and cause the session to jump position after every app restart.
        // Fall back to chatToStored's Date.now() only for very old messages
        // that predate the createdAt-in-ChatMessage field.
        if (last.createdAt != null) stored.createdAt = last.createdAt;
        if (!stored.content) stored.content = partsToContent(fixed.parts);
        void replaceLastMessage(sessionId, stored);
      }
      messagesBySession.current.set(sessionId, msgs);
      if (data.meta.runtimeSessionId) {
        runtimeSessionIdBySession.current.set(sessionId, data.meta.runtimeSessionId);
      }
      titleBySession.current.set(sessionId, data.meta.title);
      setMessages(msgs);
      const stream = streamingBySession.current.get(sessionId);
      setIsStreaming(!!stream);
      setStreamingTurnId(stream?.turnId ?? null);
      plan.syncVisiblePlan(sessionId);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, plan.setSessionPlan, plan.syncVisiblePlan]);
}
