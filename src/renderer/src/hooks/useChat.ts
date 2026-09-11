import {useCallback, useEffect, useRef, useState} from 'react';
import {chatFromStored, type ChatMessage, chatToStored, newId, partsToContent,} from '@/lib/chat';
import {appendMessage, createSession, loadFullSession, replaceLastMessage, rewriteMessages, truncateSessionMessages, updateSessionMeta,} from '@/lib/sessions';
import type {
  AgentError,
  ChatStreamEvent,
  ConnectionMeta,
  DraftAttachment,
  PermissionMode,
  StoredAttachment,
  StoredMessage,
} from '@/lib/electron';
import { storeAttachment } from '@/lib/attachments';
import { getAppSettings } from '@/lib/app-settings';
import { emitPetEvent } from '@/lib/pet-events';
import { createLogger } from '@/lib/logger';
import { applyEvent } from './chat/apply-event';
import type { SendArgs, CompactionNotice } from './chat/types';
import { useSessionStore } from './chat/session-store';
import { usePlanState } from './chat/use-plan-state';
import { useCheckpoints } from './chat/use-checkpoints';
import { useAutoTitle } from './chat/use-auto-title';

export type { CompactionNotice };

const log = createLogger('useChat');


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
    sdkSessionIdBySession,
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
      if (data.meta.sdkSessionId) {
        sdkSessionIdBySession.current.set(sessionId, data.meta.sdkSessionId);
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
              sdkSessionIdBySession.current.set(sid, evt.sessionId);
              void updateSessionMeta(sid, { sdkSessionId: evt.sessionId });
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
          resumeSessionId: sdkSessionIdBySession.current.get(sid),
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
          message:
            'The request failed before the agent could begin streaming. Try again.',
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
        } catch {
          // Skip unreadable drafts rather than blocking the steer.
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

  /** Manually triggers compaction outside of any turn (Pi backend only). */
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

  const retryImpl = useCallback(
    async (
      sid: string,
      fallback?: {
        connection: ConnectionMeta;
        model: string;
        cwd?: string;
        permissionMode: PermissionMode;
      },
    ) => {
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
              failedMsg.createdAt != null
                ? Date.now() - failedMsg.createdAt
                : failedMsg.durationMs,
          };
          const withFinalized =
            [...current.slice(0, idx), finalized, ...current.slice(idx + 1)];
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
          idx > 0 && current[idx - 1].role === 'user'
            ? current[idx - 1].id
            : null;
        const cutFrom =
          idx > 0 && current[idx - 1].role === 'user' ? idx - 1 : idx;
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
          message:
            'Could not restart the turn. Check the diagnostics below and try again.',
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
          next = disk
            ? [...disk.messages.map(chatFromStored), errBubble]
            : [errBubble];
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
    /** turnId of the in-flight send for the visible session — null when idle. */
    streamingTurnId,
    /** Every session id with an in-flight turn, including non-visible ones. */
    streamingSessionIds,
    activeSessionId,
    send,
    abort,
    retry,
    /** Mid-turn steer; appends a visible "Injected" user bubble on success. */
    steer,
    /** Manually trigger the SDK's compaction outside of any turn (Pi backend only). */
    triggerManualCompaction,
    /** True iff the visible session has a failed turn we can replay. */
    canRetry,
    /** Most recent compaction event (or null) — UI auto-fades it. */
    lastCompaction,
    // Planning workflow state
    activePlan: plan.activePlan,
    getPlanForMessage: plan.getPlanForMessage,
    showPhaseApproval: plan.showPhaseApproval,
    phaseAwaitingApproval: plan.phaseAwaitingApproval,
    showPlanRevision: plan.showPlanRevision,
    latestRevision: plan.latestRevision,
    planError: plan.planError,
    setShowPhaseApproval: plan.setShowPhaseApproval,
    setPhaseAwaitingApproval: plan.setPhaseAwaitingApproval,
    setShowPlanRevision: plan.setShowPlanRevision,
    setPlanError: plan.setPlanError,
  };
}
