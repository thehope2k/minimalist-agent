import { useEffect } from 'react';
import { chatToStored, newId, partsToContent, type ChatMessage } from '@/lib/chat';
import { replaceLastMessage, rewriteMessages, updateSessionMeta } from '@/lib/sessions';
import type { ChatStreamEvent, StoredMessage } from '@/lib/electron';
import { emitPetEvent } from '@/lib/pet-events';
import { getAppSettings } from '@/lib/app-settings';
import { createLogger } from '@/lib/logger';
import { applyEvent } from './apply-event';
import type { SessionStore } from './session-store';
import type { CompactionNotice } from './types';

const log = createLogger('useChat:events');

interface ChatEventListenerDeps extends Pick<SessionStore, 'messagesBySession' | 'streamingBySession' | 'turnIdToSession' | 'runtimeSessionIdBySession' | 'titleBySession' | 'seenCompactionEvents'> {
  activeSessionIdRef: React.MutableRefObject<string | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingTurnId: React.Dispatch<React.SetStateAction<string | null>>;
  setLastCompaction: React.Dispatch<React.SetStateAction<CompactionNotice | null>>;
  syncStreamingIds: () => void;
  scheduleCheckpoint: (sessionId: string) => void;
  cancelPendingCheckpoint: (sessionId: string) => void;
  maybeAutoGenerateTitle: (sessionId: string) => Promise<void>;
}

export function useChatEventListener(deps: ChatEventListenerDeps): void {
  const {
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
  } = deps;

// Subscribe once to chat events; route to the right session by turnId.
  useEffect(() => {
    if (!window.api?.chat) return;

    return window.api.chat.onEvent((evt: ChatStreamEvent) => {
      // Must never fall through to applyEvent — can fire mid-turn.
      if (evt.type === 'compaction_progress') {
        // Only surface the toast for the session currently on screen — a
        // background session's compaction must not leak its badge into
        // whatever chat the user happens to be viewing.
        const sid = turnIdToSession.current.get(evt.id);
        if (sid && sid === activeSessionIdRef.current) {
          setLastCompaction({
            at: Date.now(),
            status: 'running',
            trigger: evt.trigger ?? 'manual',
          });
        }
        return;
      }
      // Compaction is between-turn metadata, not part of any message.
      if (evt.type === 'compaction') {
        const sid = turnIdToSession.current.get(evt.id);
        if (sid && sid === activeSessionIdRef.current) {
          setLastCompaction({
            at: Date.now(),
            status: evt.status ?? 'success',
            trigger: evt.trigger,
            preTokens: evt.preTokens,
            postTokens: evt.postTokens,
            errorMessage: evt.errorMessage,
          });
        }

        if (!sid) {
          log.warn(
            'Compaction event for unknown turn — marker and toast both dropped:',
            { turnId: evt.id, status: evt.status, trigger: evt.trigger, preTokens: evt.preTokens },
          );
          return;
        }

        const eventKey = `${sid}:${evt.id}:${evt.status}:${evt.preTokens}`;
        if (seenCompactionEvents.current.has(eventKey)) {
          log.debug('Duplicate compaction event ignored:', eventKey);
          return;
        }
        seenCompactionEvents.current.add(eventKey);

        const marker: ChatMessage = {
          id: newId(),
          role: 'assistant',
          parts: [],
          markerKind: 'compaction',
          compactionMeta: {
            status: evt.status,
            trigger: evt.trigger,
            preTokens: evt.preTokens,
            postTokens: evt.postTokens,
            durationMs: evt.durationMs,
            summary: evt.summary,
            readFiles: evt.readFiles,
            modifiedFiles: evt.modifiedFiles,
            errorMessage: evt.errorMessage,
          },
        };

        const prevMsgs = messagesBySession.current.get(sid) ?? [];
        
        // Mid-turn insertion: find the assistant message with this turn ID
        // and insert the marker right after it. If not found (compaction
        // between turns), append at the end.
        const turnMsgIndex = prevMsgs.findIndex((m) => m.id === evt.id);
        const insertionMode = turnMsgIndex >= 0 ? 'after-turn' : 'append';
        // A successful mid-turn compaction shrinks context out from under the
        // still-streaming message, so the next assistant_usage can't be
        // diffed against its pre-compaction latestCallUsage — the drop isn't
        // anything the next tool call did. Flag it so attributeContextDelta
        // skips exactly one comparison instead of reporting a bogus number.
        const turnMsg =
          insertionMode === 'after-turn' && evt.status === 'success'
            ? { ...prevMsgs[turnMsgIndex], contextResetPending: true }
            : prevMsgs[turnMsgIndex];
        const next =
          turnMsgIndex >= 0
            ? [
                ...prevMsgs.slice(0, turnMsgIndex),
                turnMsg,
                marker,
                ...prevMsgs.slice(turnMsgIndex + 1),
              ]
            : [...prevMsgs, marker];

        log.debug(
          'Compaction marker created:',
          {
            eventKey,
            trigger: evt.trigger,
            preTokens: evt.preTokens,
            postTokens: evt.postTokens,
            turnId: evt.id,
            insertionMode,
            turnMsgIndex,
          },
        );

        messagesBySession.current.set(sid, next);
        if (sid === activeSessionIdRef.current) setMessages(next);
        
        // Persist the entire message array to maintain correct order on disk.
        // Using appendMessage() would write the marker to the end, losing the
        // mid-turn position on reload.
        void rewriteMessages(sid, next.map(chatToStored));
        return;
      }

      const sid = turnIdToSession.current.get(evt.id);
      if (!sid) {
        // Event for a turn we no longer track (post-reload, post-abort).
        return;
      }

      const prev = messagesBySession.current.get(sid);
      if (!prev) return;
      const next = prev.map((m) => (m.id === evt.id ? applyEvent(m, evt) : m));
      messagesBySession.current.set(sid, next);

      if (evt.type === 'tool_start') emitPetEvent('tool-start');
      if (evt.type === 'tool_result' && evt.isError) emitPetEvent('tool-error');

      if (sid === activeSessionIdRef.current) {
        setMessages(next);
      }

      // Mid-stream checkpoint so a kill / window-close mid-turn doesn't
      // lose the partial reply. Coalesces; turn_done cancels the timer.
      if (evt.type !== 'turn_done' && evt.type !== 'error') {
        scheduleCheckpoint(sid);
      }

      if (evt.type === 'turn_done' || evt.type === 'error') {
        // Defer to next tick so the bucket reflects the just-applied event.
        queueMicrotask(() => {
          // Cancel any pending mid-stream checkpoint — the final write below
          // is authoritative.
          cancelPendingCheckpoint(sid);
          const bucket = messagesBySession.current.get(sid);
          const final = bucket?.find((m) => m.id === evt.id);
          if (final) {
            const stored: StoredMessage = chatToStored(final);
            if (!stored.content) stored.content = partsToContent(final.parts);
            void replaceLastMessage(sid, stored);
            if (evt.sessionId) {
              runtimeSessionIdBySession.current.set(sid, evt.sessionId);
              void updateSessionMeta(sid, { runtimeSessionId: evt.sessionId });
            }
            if (evt.type === 'turn_done' && !final.errorInfo) {
              void maybeAutoGenerateTitle(sid);
            }
          }
          // Stream lifecycle ends regardless of whether the bubble matched.
          streamingBySession.current.delete(sid);
          turnIdToSession.current.delete(evt.id);
          syncStreamingIds();
          if (sid === activeSessionIdRef.current) {
            setIsStreaming(false);
            setStreamingTurnId(null);
          }
          // Keep-awake gate is global; only release when nothing is streaming.
          if (streamingBySession.current.size === 0) {
            void window.api.app.setAgentActive(false);
          }
          // Notification only for the session that just finished.
          if (
            getAppSettings().notificationsEnabled &&
            !document.hasFocus()
          ) {
            const isError = evt.type === 'error';
            const title = isError ? 'Agent turn failed' : 'Agent turn complete';
            const sessionName = titleBySession.current.get(sid)?.trim();
            const body = isError
              ? evt.error.title || evt.error.message
              : sessionName || 'Your assistant has finished responding.';
            window.api.app
              .notify(title, body)
              .catch((err) => log.debug('OS notification failed:', err));
          }
        });
      }
    });
  }, [maybeAutoGenerateTitle]);

}
