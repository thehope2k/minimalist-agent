import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Share2 } from 'lucide-react';
import { ChatScroll } from '../chat/ChatScroll';
import { MessageInput } from '../chat/MessageInput';
import { MessageList } from '../chat/MessageList';
import { EmptyState } from '../chat/EmptyState';
import { PermissionPrompt } from '../chat/PermissionPrompt';
import { IconButton } from '../ui';
import { useChat } from '@/hooks/useChat';
import { useAiData } from '@/hooks/useAiData';
import { loadFullSession, setSessionPermissionMode } from '@/lib/sessions';
import { findProject } from '@/lib/projects';
import { useProjects } from '@/hooks/useProjects';
import { homedir } from '@/lib/path';
import type { PermissionMode } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

type Props = {
  sessionId: string | null;
  /** Called when the user sends in an unsaved chat — App tracks the new id. */
  onSessionCreated: (id: string) => void;
  /** Called when user clicks the "X / new" header button. */
  onNewSession: () => void;
  /** Structured submission auto-sent on next mount (e.g. New Skill). */
  seedSubmit?: SeedSubmit | null;
  /** Fires once ChatArea has consumed the seed; lets App clear its state. */
  onSeedSubmitConsumed?: () => void;
  newSessionDefaultProjectId?: string | null;
  /** Reports the set of session ids with active streams (including off-screen). */
  onStreamingChange?: (ids: ReadonlySet<string>) => void;
};

export function ChatArea({
  sessionId,
  onSessionCreated,
  onNewSession,
  seedSubmit,
  onSeedSubmitConsumed,
  newSessionDefaultProjectId,
  onStreamingChange,
}: Props) {
  const { messages, isStreaming, streamingTurnId, streamingSessionIds, send, abort, retry, steer, activeSessionId, lastCompaction } = useChat(sessionId, newSessionDefaultProjectId);
  const aiData = useAiData();
  // Bootstraps the project store; we read it imperatively below via findProject.
  useProjects();
  /** Per-session working directory; rehydrated from session metadata on switch. */
  const [cwd, setCwd] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState<string>('New session');
  /**
   * Project-level default connection slug to seed MessageInput's resolver.
   * Re-derived on session switch (loaded session's projectId) and on filter
   * change (fresh-chat case). Empty string = "no project default; use global".
   */
  const [projectDefaultConnectionSlug, setProjectDefaultConnectionSlug] =
    useState<string>('');
  /**
   * Connection + model the loaded session last sent with. Empty when the
   * session has no record yet (e.g. brand-new fresh chat). MessageInput
   * uses this to seed the pill so each session "remembers" its choice.
   *
   * `loadedSessionPickId` is the sessionId these values belong to — set
   * after the async load resolves. MessageInput only syncs when this
   * matches the visible sessionId, which avoids a stale value from the
   * previous session leaking onto the pill during a switch.
   */
  const [sessionConnectionSlug, setSessionConnectionSlug] = useState<string>('');
  const [sessionModel, setSessionModel] = useState<string>('');
  const [loadedSessionPickId, setLoadedSessionPickId] = useState<string | null>(
    null,
  );
  /**
   * Per-session permission mode. Falls back to the global default until a
   * session-level value is set explicitly. Initialized to 'ask' so the
   * pill always has a sane label even before AI settings have loaded.
   */
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('ask');
  /**
   * `true` once we've adopted the per-session value (or confirmed there
   * isn't one). Prevents the pill from briefly flashing the global default
   * before the session loads.
   */
  const sessionModeLoadedRef = useRef(false);

  /**
   * Cheap content-changed signal for ChatScroll. Combines message count
   * with the last message's text length so streaming tokens nudge the
   * stick-to-bottom effect.
   */
  const last = messages[messages.length - 1];
  const lastTextLen = last
    ? last.parts.reduce(
        (n, p) =>
          p.kind === 'text' || p.kind === 'thinking'
            ? n + p.text.length
            : n + 1,
        0,
      )
    : 0;
  const contentSignal = messages.length * 10_000 + lastTextLen;

  // Rehydrate cwd + title when switching sessions.
  useEffect(() => {
    if (!sessionId) {
      setTitle('New session');
      sessionModeLoadedRef.current = false;
      // Fresh chat picks defaults from the active project filter (when
      // the user is filtered to a specific project) and falls back to
      // global settings otherwise.
      const projForFresh = findProject(newSessionDefaultProjectId);
      setCwd(projForFresh?.rootPath ?? undefined);
      setPermissionMode(
        projForFresh?.defaultPermissionMode ??
          aiData?.settings.defaultPermissionMode ??
          'ask',
      );
      setProjectDefaultConnectionSlug(
        projForFresh?.defaultConnectionSlug ?? '',
      );
      // Fresh chat: clear any prior session's pick + ack the "load" so
      // MessageInput knows there's no remembered pick to apply.
      setSessionConnectionSlug('');
      setSessionModel('');
      setLoadedSessionPickId(null);
      return;
    }
    // Mark stale until the new session's data resolves.
    setLoadedSessionPickId(null);
    sessionModeLoadedRef.current = false;
    let cancelled = false;
    loadFullSession(sessionId).then((data) => {
      if (cancelled || !data) return;
      setCwd(data.meta.workingDirectory);
      setTitle(data.meta.title);
      const project = findProject(data.meta.projectId);
      setPermissionMode(
        data.meta.permissionMode ??
          project?.defaultPermissionMode ??
          aiData?.settings.defaultPermissionMode ??
          'ask',
      );
      setProjectDefaultConnectionSlug(project?.defaultConnectionSlug ?? '');
      setSessionConnectionSlug(data.meta.connectionSlug ?? '');
      setSessionModel(data.meta.model ?? '');
      setLoadedSessionPickId(data.meta.id);
      sessionModeLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
    // aiData ref is intentionally read at load time; we don't want a
    // settings update to clobber a session-level override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, newSessionDefaultProjectId]);

  // For unsaved fresh chats, keep tracking the cascade (project default →
  // global default) so changes in those defaults reflect on the pill
  // before the user explicitly picks a mode.
  useEffect(() => {
    if (sessionId) return;
    if (!aiData) return;
    const projForFresh = findProject(newSessionDefaultProjectId);
    setPermissionMode(
      projForFresh?.defaultPermissionMode ??
        aiData.settings.defaultPermissionMode ??
        'ask',
    );
  }, [
    sessionId,
    aiData?.settings.defaultPermissionMode,
    newSessionDefaultProjectId,
    aiData,
  ]);

  // When useChat creates a new session on first send, propagate up to App.
  useEffect(() => {
    if (activeSessionId && activeSessionId !== sessionId) {
      onSessionCreated(activeSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Notify App whenever the set of streaming sessions changes. SessionsPanel
  // uses this to pulse every active row, even ones the user isn't viewing.
  useEffect(() => {
    onStreamingChange?.(streamingSessionIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingSessionIds]);

  // Build a "continue" send that resumes from the last max_turns stop.
  // Uses the session's remembered connection/model so the pill stays in sync.
  const handleContinue = useCallback(() => {
    if (!aiData) return;
    const connection =
      aiData.connections.find((c) => c.slug === sessionConnectionSlug) ??
      aiData.connections.find((c) => c.slug === aiData.defaultSlug) ??
      aiData.connections[0];
    if (!connection) return;
    const model =
      sessionModel ||
      connection.models.find((m) => m.id === aiData.settings.defaultModel)?.id ||
      connection.defaultModel;
    void send({
      text: 'continue',
      connection,
      model,
      cwd: cwd ?? (homedir() || undefined),
      maxTurns: aiData.settings.maxTurns,
      permissionMode,
    });
  }, [aiData, sessionConnectionSlug, sessionModel, send, cwd, permissionMode]);

  // Retry handler — passes a fallback so the cold path (session loaded
  // after an interrupted turn, no in-memory `lastSend`) can reconstruct
  // the SendArgs from session metadata + the trailing user message.
  const handleRetry = useCallback(() => {
    if (!aiData) return void retry();
    const connection =
      aiData.connections.find((c) => c.slug === sessionConnectionSlug) ??
      aiData.connections.find((c) => c.slug === aiData.defaultSlug) ??
      aiData.connections[0];
    if (!connection) return void retry();
    const model =
      sessionModel ||
      connection.models.find((m) => m.id === aiData.settings.defaultModel)?.id ||
      connection.defaultModel;
    void retry({
      connection,
      model,
      cwd: cwd ?? (homedir() || undefined),
      maxTurns: aiData.settings.maxTurns,
      permissionMode,
    });
  }, [aiData, sessionConnectionSlug, sessionModel, retry, cwd, permissionMode]);

  /**
   * Auto-send a seeded submission (e.g. from "+ New Skill"). We wait
   * until the AI data has loaded and there's no in-flight stream, then
   * fire `send()` with the structured payload.
   */
  const seedFiredRef = useRef<SeedSubmit | null>(null);
  useEffect(() => {
    if (!seedSubmit) return;
    if (seedFiredRef.current === seedSubmit) return;
    if (!aiData) return;
    if (isStreaming) return;
    if (messages.length > 0) return;
    const connection =
      aiData.connections.find((c) => c.slug === aiData.defaultSlug) ??
      aiData.connections[0];
    if (!connection) return;
    const model =
      connection.models.find((m) => m.id === aiData.settings.defaultModel)?.id ??
      connection.defaultModel;
    if (!model) return;

    seedFiredRef.current = seedSubmit;
    onSeedSubmitConsumed?.();
    void send({
      text: seedSubmit.displayText,
      agentText: seedSubmit.agentText,
      intentTag: seedSubmit.intentTag,
      connection,
      model,
      cwd: cwd ?? (homedir() || undefined),
      maxTurns: aiData.settings.maxTurns,
      permissionMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedSubmit, aiData, isStreaming, messages.length]);

  return (
    // `min-h-0` + `overflow-hidden` together force this column to never
    // grow past its parent. Without them, `flex-1` items default to
    // `min-height: auto` and let long messages push the input below the
    // viewport instead of scrolling internally.
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex-1" />
        <h2 className="max-w-120 truncate text-[15px] font-semibold text-fg">
          {title}
        </h2>
        <div className="flex flex-1 items-center justify-end gap-1">
          <IconButton icon={Share2} label="Share" disabled />
          <IconButton icon={X} label="New" onClick={onNewSession} />
        </div>
      </header>

      <ChatScroll sessionId={activeSessionId ?? sessionId} contentSignal={contentSignal}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="pl-4 pr-12">
            <MessageList
              messages={messages}
              onRetry={handleRetry}
              isStreaming={isStreaming}
              onContinue={isStreaming ? undefined : handleContinue}
            />
          </div>
        )}
      </ChatScroll>

      <div className="shrink-0 pb-4 pt-2 relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-linear-to-b from-transparent to-canvas"
        />
        <div className="pl-4 pr-12">
        <MessageInput
          isStreaming={isStreaming}
          streamingTurnId={streamingTurnId}
          cwd={cwd}
          onChangeCwd={setCwd}
          cwdLocked={messages.length > 0}
          permissionMode={permissionMode}
          onChangePermissionMode={(mode) => {
            setPermissionMode(mode);
            // Persist if we already have a session; otherwise the next
            // send will create one and `useChat` will surface it via
            // `onSessionCreated`, at which point the persisted mode
            // doesn't matter — the in-flight send already carries it.
            if (activeSessionId) {
              void setSessionPermissionMode(activeSessionId, mode);
            }
          }}
          onSend={(args) =>
            send({ ...args, cwd: cwd ?? (homedir() || undefined) })
          }
          onAbort={abort}
          onSteer={steer}
          sessionId={activeSessionId ?? sessionId}
          title={title}
          messages={messages}
          lastCompaction={lastCompaction}
          projectDefaultConnectionSlug={
            projectDefaultConnectionSlug || undefined
          }
          sessionConnectionSlug={sessionConnectionSlug || undefined}
          sessionModel={sessionModel || undefined}
          loadedSessionPickId={loadedSessionPickId}
        />
        </div>
      </div>

      {/* Mounted once at the chat-area level so it survives session
          switches; the prompt subscribes to a global IPC channel. */}
      <PermissionPrompt />
    </main>
  );
}
