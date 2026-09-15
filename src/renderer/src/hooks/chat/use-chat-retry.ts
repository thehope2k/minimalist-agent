import { useCallback } from 'react';
import type { ChatMessage } from '@/lib/chat';
import type { SessionStore } from './session-store';

import { chatFromStored, chatToStored, newId, partsToContent } from '@/lib/chat';
import {
  appendMessage,
  loadFullSession,
  replaceLastMessage,
  truncateSessionMessages,
} from '@/lib/sessions';
import type { AgentError, ConnectionMeta, PermissionMode } from '@/lib/electron';
import { createLogger } from '@/lib/logger';
import type { SendArgs } from './types';

const log = createLogger('useChat:retry');

interface RetryFallback {
  connection: ConnectionMeta;
  model: string;
  cwd?: string;
  permissionMode: PermissionMode;
}

interface ChatRetryDeps extends Pick<
  SessionStore,
  'messagesBySession' | 'streamingBySession' | 'turnIdToSession' | 'lastSendBySession'
> {
  activeSessionIdRef: React.MutableRefObject<string | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingTurnId: React.Dispatch<React.SetStateAction<string | null>>;
  syncStreamingIds: () => void;
  send: (args: SendArgs) => Promise<void>;
}

export function useChatRetry(deps: ChatRetryDeps) {
  const {
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
  } = deps;

  const retryImpl = useCallback(
    async (sid: string, fallback?: RetryFallback) => {
      const last = lastSendBySession.current.get(sid);
      if (last) {
        // Hot path: retry within the same app run.
        const failedAssistantId = last.assistantId;
        const current = messagesBySession.current.get(sid) ?? [];
        const idx = current.findIndex((m) => m.id === failedAssistantId);
        const failedMsg = idx >= 0 ? current[idx] : null;

        // If the turn made meaningful progress (at least one tool call
        // completed successfully), preserve the partial work in the
        // transcript and ask the agent to continue. Re-playing the
        // original message from scratch would redo work already done and
        // lose the context the model built up during those tool calls.
        const hadProgress =
          failedMsg?.parts.some((p) => p.kind === 'tool' && p.status === 'done') ?? false;

        if (hadProgress && failedMsg) {
          // Finalize the partial bubble: clear the error flags and mark it
          // as aborted so it looks like a stopped (not failed) turn while
          // still showing every tool call that already ran.
          const finalized: ChatMessage = {
            ...failedMsg,
            isStreaming: false,
            stopReason: 'aborted',
            errorInfo: undefined,
            error: undefined,
            durationMs:
              failedMsg.createdAt != null ? Date.now() - failedMsg.createdAt : failedMsg.durationMs,
          };
          const withFinalized = [...current.slice(0, idx), finalized, ...current.slice(idx + 1)];
          messagesBySession.current.set(sid, withFinalized);
          if (sid === activeSessionIdRef.current) setMessages(withFinalized);
          const stored = chatToStored(finalized);
          if (!stored.content) stored.content = partsToContent(finalized.parts);
          await replaceLastMessage(sid, stored);

          await send({ ...last.args, text: 'continue' });
          return;
        }

        // No meaningful progress — drop the failed pair and re-send verbatim.
        // Do not update the UI here: send() will call setMessages() with the
        // full replacement messages, so the chat never flashes to a truncated
        // or empty state during the disk I/O below.
        const userBeforeId =
          idx > 0 && current[idx - 1].role === 'user' ? current[idx - 1].id : null;
        const cutFrom = idx > 0 && current[idx - 1].role === 'user' ? idx - 1 : idx;
        const withoutFailed = idx < 0 ? current : current.slice(0, cutFrom);
        messagesBySession.current.set(sid, withoutFailed);
        const dropFromId = userBeforeId ?? failedAssistantId;
        await truncateSessionMessages(sid, dropFromId);
        await send(last.args);
        return;
      }

      // Cold path: app was relaunched after an interrupted turn. The
      // recovery code in the session-load effect rewrote the trailing
      // assistant as `errorInfo.canRetry: true`, but `lastSendBySession`
      // is empty. Reconstruct the SendArgs from the bucket's last user
      // message + caller-supplied connection/model.
      if (!fallback) return;
      const current = messagesBySession.current.get(sid) ?? [];
      // Find the trailing assistant and the user message before it.
      let assistantIdx = -1;
      for (let i = current.length - 1; i >= 0; i--) {
        if (current[i].role === 'assistant') {
          assistantIdx = i;
          break;
        }
      }
      const userIdx = assistantIdx > 0 ? assistantIdx - 1 : -1;
      if (userIdx < 0 || current[userIdx].role !== 'user') return;

      const failedCold = assistantIdx >= 0 ? current[assistantIdx] : null;
      const hadColdProgress =
        failedCold?.parts.some((p) => p.kind === 'tool' && p.status === 'done') ?? false;

      if (hadColdProgress && failedCold) {
        // Same logic as the hot path: finalize the partial bubble and continue.
        const finalized: ChatMessage = {
          ...failedCold,
          isStreaming: false,
          stopReason: 'aborted',
          errorInfo: undefined,
          error: undefined,
        };
        const withFinalized = [
          ...current.slice(0, assistantIdx),
          finalized,
          ...current.slice(assistantIdx + 1),
        ];
        messagesBySession.current.set(sid, withFinalized);
        if (sid === activeSessionIdRef.current) setMessages(withFinalized);
        const stored = chatToStored(finalized);
        if (!stored.content) stored.content = partsToContent(finalized.parts);
        await replaceLastMessage(sid, stored);
        await send({
          text: 'continue',
          connection: fallback.connection,
          model: fallback.model,
          cwd: fallback.cwd,
          permissionMode: fallback.permissionMode,
        });
        return;
      }

      const userMsg = current[userIdx];
      const userText = partsToContent(userMsg.parts).trim();
      if (!userText) return;

      // No meaningful progress — drop both messages and re-send.
      // Defer the state update for the same reason as the hot path.
      const withoutFailed = current.slice(0, userIdx);
      messagesBySession.current.set(sid, withoutFailed);
      await truncateSessionMessages(sid, userMsg.id);
      await send({
        text: userText,
        connection: fallback.connection,
        model: fallback.model,
        cwd: fallback.cwd,
        permissionMode: fallback.permissionMode,
      });
    },
    [send],
  );

  const retry = useCallback(
    async (fallback?: {
      connection: ConnectionMeta;
      model: string;
      cwd?: string;
      permissionMode: PermissionMode;
    }) => {
      const sid = activeSessionIdRef.current;
      if (!sid) return;
      if (streamingBySession.current.has(sid)) return;

      try {
        await retryImpl(sid, fallback);
      } catch (e) {
        log.error('retry() failed:', e);
        const errMsg = e instanceof Error ? e.message : String(e);
        const errInfo: AgentError = {
          code: 'unknown_error',
          title: 'Retry failed',
          message: 'Could not restart the turn. Check the diagnostics below and try again.',
          canRetry: true,
          originalError: errMsg,
        };
        const errBubble: ChatMessage = {
          id: newId(),
          role: 'assistant',
          parts: [],
          isStreaming: false,
          errorInfo: errInfo,
          error: errMsg,
        };
        let next: ChatMessage[];
        try {
          const disk = await loadFullSession(sid);
          next = disk ? [...disk.messages.map(chatFromStored), errBubble] : [errBubble];
        } catch {
          next = [...(messagesBySession.current.get(sid) ?? []), errBubble];
        }
        messagesBySession.current.set(sid, next);
        void appendMessage(sid, chatToStored(errBubble)).catch((persistErr) => {
          log.warn(
            'Failed to persist "Retry failed" bubble — a reload may not show it:',
            persistErr,
          );
        });
        streamingBySession.current.delete(sid);
        for (const [turnId, mappedSid] of turnIdToSession.current) {
          if (mappedSid === sid) turnIdToSession.current.delete(turnId);
        }
        const staleLast = lastSendBySession.current.get(sid);
        if (staleLast) {
          lastSendBySession.current.set(sid, {
            args: staleLast.args,
            assistantId: errBubble.id,
          });
        } else {
          lastSendBySession.current.delete(sid);
        }
        syncStreamingIds();
        if (sid === activeSessionIdRef.current) {
          setMessages(next);
          setIsStreaming(false);
          setStreamingTurnId(null);
        }
      }
    },
    [retryImpl],
  );

  return { retry };
}
