import { useCallback } from 'react';
import type { ChatMessage } from '@/lib/chat';
import type { SessionStore } from './session-store';

import { chatToStored, newId } from '@/lib/chat';
import {
  appendMessage,
  createSession,
  loadFullSession,
  replaceLastMessage,
  updateSessionMeta,
} from '@/lib/sessions';
import type { AgentError, StoredAttachment } from '@/lib/electron';
import { storeAttachment } from '@/lib/attachments';
import type { SendArgs } from './types';

interface ChatSendDeps extends Pick<
  SessionStore,
  | 'messagesBySession'
  | 'streamingBySession'
  | 'turnIdToSession'
  | 'titleBySession'
  | 'lastSendBySession'
> {
  activeSessionIdRef: React.MutableRefObject<string | null>;
  defaultProjectIdRef: React.MutableRefObject<string | null | undefined>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingTurnId: React.Dispatch<React.SetStateAction<string | null>>;
  syncStreamingIds: () => void;
  forceRerender: () => void;
}

export function useChatSend(deps: ChatSendDeps) {
  const {
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
  } = deps;

  const send = useCallback(
    async ({
      text,
      connection,
      model,
      cwd,
      permissionMode,
      autonomyLevel,
      thinkingLevel,
      attachments: drafts,
      agentText,
      intentTag,
    }: SendArgs) => {
      const trimmed = text.trim();
      const draftsList = drafts ?? [];
      if (!trimmed && draftsList.length === 0) return;
      const promptForAgent = (agentText ?? trimmed).trim();

      let sid = activeSessionIdRef.current;
      const isFreshSession = !sid;
      if (!sid) {
        // If the user is filtering to a specific project, the new session
        // belongs there explicitly — overrides cwd-based auto-assignment.
        const explicitProjectId = defaultProjectIdRef.current;
        const created = await createSession({
          workingDirectory: cwd,
          ...(explicitProjectId ? { projectId: explicitProjectId } : {}),
        });
        sid = created.id;
        // Seed the bucket BEFORE flipping activeSessionId so the
        // session-switch effect (and any prop-driven re-run from App)
        // sees a populated bucket and skips the disk reload.
        messagesBySession.current.set(sid, []);
        activeSessionIdRef.current = sid;
        setActiveSessionId(sid);
      }
      await updateSessionMeta(sid, {
        permissionMode,
        ...(autonomyLevel !== undefined ? { autonomyLevel } : {}),
        ...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
        connectionSlug: connection.slug,
        model,
        ...(cwd ? { workingDirectory: cwd } : {}),
      });

      // Attachments — failures abort the send with an inline error bubble.
      const stored: StoredAttachment[] = [];
      for (const d of draftsList) {
        try {
          stored.push(await storeAttachment(sid, d));
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          const errInfo: AgentError = {
            code: 'unknown_error',
            title: 'Failed to attach file',
            message: errMsg,
            canRetry: true,
          };
          const errBubble: ChatMessage = {
            id: newId(),
            role: 'assistant',
            parts: [],
            isStreaming: false,
            errorInfo: errInfo,
            error: errMsg,
          };
          const prev = messagesBySession.current.get(sid) ?? [];
          const next = [...prev, errBubble];
          messagesBySession.current.set(sid, next);
          if (sid === activeSessionIdRef.current) setMessages(next);
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        parts: trimmed ? [{ kind: 'text', text: trimmed }] : [],
        attachments: stored.length > 0 ? stored : undefined,
        intentTag,
      };
      const assistantId = newId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        parts: [],
        isStreaming: true,
        model,
        createdAt: Date.now(),
      };

      const prev = messagesBySession.current.get(sid) ?? [];
      const next = [...prev, userMsg, assistantMsg];
      messagesBySession.current.set(sid, next);
      streamingBySession.current.set(sid, { turnId: assistantId });
      turnIdToSession.current.set(assistantId, sid);
      syncStreamingIds();
      lastSendBySession.current.set(sid, {
        args: {
          text: trimmed,
          connection,
          model,
          cwd,
          permissionMode,
          attachments: drafts,
        },
        assistantId,
      });

      if (sid === activeSessionIdRef.current) {
        setMessages(next);
        setIsStreaming(true);
        setStreamingTurnId(assistantId);
      }
      forceRerender(); // refresh canRetry across sessions
      void window.api.app.setAgentActive(true);

      await appendMessage(sid, chatToStored(userMsg));
      await appendMessage(sid, chatToStored(assistantMsg));

      // Refresh cached title for fresh sessions (main rewrites
      // `meta.title` from the first user message inside `appendMessage`).
      if (isFreshSession || !titleBySession.current.get(sid)) {
        void loadFullSession(sid).then((d) => {
          if (d) titleBySession.current.set(sid, d.meta.title);
        });
      }

      try {
        await window.api.chat.send({
          id: assistantId,
          connectionSlug: connection.slug,
          model,
          prompt: promptForAgent,
          cwd,
          permissionMode,
          sessionId: sid,
          attachments: stored.length > 0 ? stored : undefined,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        // The IPC bridge itself failed (rare — e.g. main-process crash).
        const errInfo: AgentError = {
          code: 'unknown_error',
          title: 'Could not start the turn',
          message: 'The request failed before the agent could begin streaming. Try again.',
          canRetry: true,
          originalError: errMsg,
        };
        const cur = messagesBySession.current.get(sid) ?? [];
        const updated = cur.map((m) =>
          m.id === assistantId
            ? { ...m, isStreaming: false, errorInfo: errInfo, error: errMsg }
            : m,
        );
        messagesBySession.current.set(sid, updated);
        void replaceLastMessage(sid, {
          id: assistantId,
          role: 'assistant',
          content: '',
          error: errMsg,
          errorInfo: errInfo,
          createdAt: Date.now(),
        });
        streamingBySession.current.delete(sid);
        turnIdToSession.current.delete(assistantId);
        syncStreamingIds();
        if (sid === activeSessionIdRef.current) {
          setMessages(updated);
          setIsStreaming(false);
          setStreamingTurnId(null);
        }
        if (streamingBySession.current.size === 0) {
          void window.api.app.setAgentActive(false);
        }
      }
    },
    [forceRerender],
  );

  return { send };
}
