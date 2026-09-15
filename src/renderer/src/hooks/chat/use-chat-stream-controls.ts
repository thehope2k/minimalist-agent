import { useCallback } from 'react';
import { chatToStored, newId, partsToContent, type ChatMessage } from '@/lib/chat';
import { replaceLastMessage, rewriteMessages } from '@/lib/sessions';
import type { DraftAttachment, StoredAttachment } from '@/lib/electron';
import { storeAttachment } from '@/lib/attachments';
import { createLogger } from '@/lib/logger';
import type { SessionStore } from './session-store';

const log = createLogger('useChat:stream-controls');

interface ChatStreamControlsDeps extends Pick<SessionStore, 'messagesBySession' | 'streamingBySession' | 'turnIdToSession'> {
  activeSessionIdRef: React.MutableRefObject<string | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingTurnId: React.Dispatch<React.SetStateAction<string | null>>;
  syncStreamingIds: () => void;
}

export function useChatStreamControls(deps: ChatStreamControlsDeps) {
  const {
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    activeSessionIdRef,
    setMessages,
    setIsStreaming,
    setStreamingTurnId,
    syncStreamingIds,
  } = deps;

  /**
   * Inject a user message into the running turn (mid-turn steer). The
   * message is delivered via the SDK's streaming-input mechanism.
   *
   * For chronological accuracy in the UI, we split the current assistant
   * bubble into:
   *  1) pre-steer assistant segment (finalized)
   *  2) injected user steer message
   *  3) post-steer assistant segment (continues streaming on same turnId)
   */
  const steer = useCallback(
    async (
      text: string,
      attachmentDrafts: DraftAttachment[] = [],
    ): Promise<{ ok: boolean; reason?: string }> => {
      const sid = activeSessionIdRef.current;
      if (!sid) return { ok: false, reason: 'no active session' };
      const stream = streamingBySession.current.get(sid);
      if (!stream) return { ok: false, reason: 'no running turn' };
      const trimmed = text.trim();
      if (!trimmed && attachmentDrafts.length === 0)
        return { ok: false, reason: 'empty message' };

      // Store draft attachments before sending (same path as normal send).
      const stored: StoredAttachment[] = [];
      for (const d of attachmentDrafts) {
        try {
          stored.push(await storeAttachment(sid, d));
        } catch (err) {
          log.warn('Failed to store steer attachment:', err);
        }
      }

      const result = await window.api.chat.steer(
        stream.turnId,
        trimmed,
        stored.length > 0 ? stored : undefined,
      );
      if (!result.ok) return result;

      const current = messagesBySession.current.get(sid) ?? [];
      const idx = current.findIndex((m) => m.id === stream.turnId);
      const steerMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        parts: trimmed ? [{ kind: 'text', text: trimmed }] : [],
        attachments: stored.length > 0 ? stored : undefined,
        intentTag: 'steer',
      };

      let next: ChatMessage[];
      if (idx >= 0) {
        const liveAssistant = current[idx];
        const preSteerAssistant: ChatMessage = {
          ...liveAssistant,
          id: newId(),
          isStreaming: false,
          durationMs:
            liveAssistant.createdAt != null
              ? Date.now() - liveAssistant.createdAt
              : liveAssistant.durationMs,
        };

        const postSteerAssistant: ChatMessage = {
          id: stream.turnId,
          role: 'assistant',
          parts: [],
          isStreaming: true,
          model: liveAssistant.model,
          createdAt: Date.now(),
        };

        next = [
          ...current.slice(0, idx),
          preSteerAssistant,
          steerMsg,
          postSteerAssistant,
          ...current.slice(idx + 1),
        ];
      } else {
        // Defensive fallback: if the live assistant bubble is missing,
        // at least preserve the injected message and keep stream running.
        const postSteerAssistant: ChatMessage = {
          id: stream.turnId,
          role: 'assistant',
          parts: [],
          isStreaming: true,
          createdAt: Date.now(),
        };
        next = [...current, steerMsg, postSteerAssistant];
      }

      messagesBySession.current.set(sid, next);
      if (sid === activeSessionIdRef.current) setMessages(next);

      // Persist reordered timeline so reload preserves exact injection point.
      void rewriteMessages(sid, next.map(chatToStored));

      return result;
    },
    [],
  );

  /** Manually triggers compaction outside of any turn. */
  const triggerManualCompaction = useCallback(
    async (
      connectionSlug: string,
      customInstructions?: string,
    ): Promise<{ ok: boolean; reason?: string }> => {
      const sid = activeSessionIdRef.current;
      if (!sid) return { ok: false, reason: 'no active session' };
      if (streamingBySession.current.has(sid)) {
        return { ok: false, reason: 'turn in progress' };
      }

      const turnId = newId();
      const placeholder: ChatMessage = {
        id: turnId,
        role: 'assistant',
        parts: [],
        isStreaming: true,
        createdAt: Date.now(),
      };
      const prev = messagesBySession.current.get(sid) ?? [];
      const next = [...prev, placeholder];
      messagesBySession.current.set(sid, next);
      streamingBySession.current.set(sid, { turnId });
      turnIdToSession.current.set(turnId, sid);
      syncStreamingIds();
      if (sid === activeSessionIdRef.current) {
        setMessages(next);
        setIsStreaming(true);
        setStreamingTurnId(turnId);
      }

      await window.api.chat.manualCompact({
        turnId,
        sessionId: sid,
        connectionSlug,
        customInstructions,
      });

      return { ok: true };
    },
    [],
  );

  const abort = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    const stream = streamingBySession.current.get(sid);
    if (!stream) return;
    await window.api?.chat.abort(stream.turnId);
    streamingBySession.current.delete(sid);
    turnIdToSession.current.delete(stream.turnId);
    syncStreamingIds();

    const current = messagesBySession.current.get(sid) ?? [];
    const updated = current.map((m) =>
      m.id === stream.turnId
        ? {
            ...m,
            isStreaming: false,
            stopReason: 'aborted',
            durationMs: m.createdAt != null ? Date.now() - m.createdAt : undefined,
            parts: m.parts.map((p) =>
              p.kind === 'tool' && p.status === 'running'
                ? { ...p, status: 'error' as const, result: { content: 'Aborted by user', isError: true } }
                : p,
            ),
          }
        : m,
    );
    messagesBySession.current.set(sid, updated);

    // Persist the finalised state so the bubble survives a reload.
    const final = updated.find((m) => m.id === stream.turnId);
    if (final) {
      const stored = chatToStored(final);
      if (!stored.content) stored.content = partsToContent(final.parts);
      void replaceLastMessage(sid, stored);
    }

    if (sid === activeSessionIdRef.current) {
      setMessages(updated);
      setIsStreaming(false);
      setStreamingTurnId(null);
    }
    if (streamingBySession.current.size === 0) {
      void window.api?.app.setAgentActive(false);
    }
  }, []);


  return { steer, triggerManualCompaction, abort };
}
