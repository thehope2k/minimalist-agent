import { useEffect, useRef, useState, useCallback } from 'react';
import { GitBranch, X, PanelRight } from 'lucide-react';
import { ChatScroll } from '../chat/ChatScroll';
import { MessageInput } from '../chat/MessageInput';
import { MessageList } from '../chat/MessageList';
import { EmptyState } from '../chat/EmptyState';
import { PermissionPrompt } from '../chat/PermissionPrompt';
import { IconButton } from '../ui';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui';
import { useResizablePanels } from '@/hooks/useResizablePanels';
import { useChat } from '@/hooks/useChat';
import { useAiData } from '@/hooks/useAiData';
import { branchSession, loadFullSession, setSessionPermissionMode, updateSessionMeta } from '@/lib/sessions';
import { findProject } from '@/lib/projects';
import { getNewSessionStateDraft, patchNewSessionStateDraft } from '@/lib/new-session-draft';
import { useProjects } from '@/hooks/useProjects';
import { homedir } from '@/lib/path';
import type { PermissionMode } from '@/lib/electron';
import type { SeedSubmit } from '@/App';
import { useSdd } from '@/hooks/useSdd';
import { SddPhaseBadge } from '@/components/sdd/SddPhaseBadge';
import { SddWizardDialog } from '@/components/sdd/SddWizardDialog';
import { SddWorkspacePanel } from './chat-area/SddWorkspacePanel';
import { deriveEntityPhase, taskProgress } from '@/lib/sdd';
import { GitDiffModal } from '@/components/git/GitDiffModal';
import { SearchModal } from '@/components/search/SearchModal';
import { RecentFilesModal } from '@/components/search/RecentFilesModal';
import { FileViewModal } from '@/components/search/FileViewModal';
import { push as pushRecentFile } from '@/lib/recent-files';

type Props = {
  sessionId: string | null;
  /** Called when the user sends in an unsaved chat — App tracks the new id. */
  onSessionCreated: (id: string) => void;
  /** Called when user clicks the “X / new” header button. */
  onNewSession: () => void;
  /** Structured submission auto-sent on next mount (e.g. New Skill). */
  seedSubmit?: SeedSubmit | null;
  /** Fires once ChatArea has consumed the seed; lets App clear its state. */
  onSeedSubmitConsumed?: () => void;
  newSessionDefaultProjectId?: string | null;
  /** Reports the set of session ids with active streams (including off-screen). */
  onStreamingChange?: (ids: ReadonlySet<string>) => void;
  /** Reports CWD changes so the global terminal panel can seed new tabs. */
  onCwdChange?: (cwd: string | undefined) => void;
  /** Global chat visibility gate (e.g. disabled while Settings/Skills/Extensions are shown). */
  shortcutsEnabled?: boolean;
};

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
}: Props) {
  const { messages, isStreaming, streamingTurnId, streamingSessionIds, send, abort, retry, steer, activeSessionId, lastCompaction } = useChat(sessionId, newSessionDefaultProjectId);
  const aiData = useAiData();
  // Bootstraps the project store; we read it imperatively below via findProject.
  useProjects();
  /** Per-session working directory; rehydrated from session metadata on switch. */
  const [cwd, setCwd] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState<string>('New session');
  const [sddMode, setSddMode] = useState<'auto' | 'off'>('off');
  const sddModeRef = useRef<'auto' | 'off'>('off');
  sddModeRef.current = sddMode;
  // Always-current mirrors for permissionMode and cwd — used when snapshotting
  // the null-slot draft on session switch (same pattern as sddModeRef).
  const permissionModeRef = useRef<PermissionMode>('ask');
  const cwdRef            = useRef<string | undefined>(undefined);
  const prevSessionIdRef  = useRef<string | null | undefined>(undefined);
  const [sddPanelOpen, setSddPanelOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);
  // Persist the chat/SDD split ratio; only meaningful when panel is open.
  const { layout: workspaceLayout, onLayoutChange: onWorkspaceLayout } =
    useResizablePanels('workspace-sdd-v1', [68, 32]);

  // SDD state for the active session - drives phase badge
  const sdd = useSdd(activeSessionId ?? sessionId, cwd, sddMode);
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
   * `loadedSessionPickId` is the sessionId these values belong to - set
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
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    // Leaving the null (new) slot → snapshot mode + cwd so they survive
    // switching to another session and back.
    if (prevId === null) {
      patchNewSessionStateDraft({
        permissionMode: permissionModeRef.current,
        cwd:            cwdRef.current,
      });
    }

    if (!sessionId) {
      setTitle('New session');
      sessionModeLoadedRef.current = false;
      const projForFresh = findProject(newSessionDefaultProjectId);

      // Restore from draft when switching back; fall back to project/global
      // defaults only when there is no saved pick (first visit to null slot).
      const d = getNewSessionStateDraft();
      const restoredCwd = d.cwd !== undefined
        ? d.cwd
        : (projForFresh?.rootPath ?? undefined);
      setCwd(restoredCwd);
      onCwdChange?.(restoredCwd);
      setPermissionMode(
        d.permissionMode ??
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
    // Clear cwd immediately so useSdd doesn't fire a scan with the previous
    // session's directory before loadFullSession resolves (BUG-SDD-07: flash
    // / prior-session data when switching sessions quickly).
    setCwd(undefined);
    onCwdChange?.(undefined);
    let cancelled = false;
    loadFullSession(sessionId).then((data) => {
      if (cancelled || !data) return;
      setCwd(data.meta.workingDirectory);
      onCwdChange?.(data.meta.workingDirectory);
      setTitle(data.meta.title);
      setSddMode(data.meta.sddMode ?? 'off');
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

  // Keep refs current so the snapshot above always reads the latest values.
  permissionModeRef.current = permissionMode;
  cwdRef.current            = cwd;

  // For unsaved fresh chats, keep tracking the cascade (project default →
  // global default) so changes in those defaults reflect on the pill
  // before the user explicitly picks a mode — but only when the user
  // hasn't already chosen a value (stored in the null-slot draft).
  useEffect(() => {
    if (sessionId) return;
    if (!aiData) return;
    if (getNewSessionStateDraft().permissionMode) return; // user pick wins
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
      // sddMode toggled on a fresh chat is never persisted (no session yet);
      // save it now so the rehydration effect reads it back correctly.
      if (sddModeRef.current !== 'off') {
        void updateSessionMeta(activeSessionId, { sddMode: sddModeRef.current });
      }
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

  // Retry handler - passes a fallback so the cold path (session loaded
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

  // Ref used to pre-fill the input after navigating to a branched session.
  // Set synchronously before onSessionCreated so the effect below catches it
  // on the very first render with the new sessionId.
  const pendingBranchDraftRef = useRef<{ sessionId: string; text: string } | null>(null);
  useEffect(() => {
    const draft = pendingBranchDraftRef.current;
    if (draft && draft.sessionId === sessionId) {
      setPendingMessage(draft.text);
      pendingBranchDraftRef.current = null;
    }
  }, [sessionId]);

  const handleBranch = useCallback(async (messageId: string) => {
    if (!sessionId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== 'user') return;
    const text = msg.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const meta = await branchSession(sessionId, messageId);
    if (!meta) return;
    // Store the draft BEFORE navigation so the effect above can pick it up.
    pendingBranchDraftRef.current = { sessionId: meta.id, text };
    onSessionCreated(meta.id);
  }, [sessionId, messages, onSessionCreated]);

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

  const activeSession = activeSessionId ?? sessionId;

  // Git diff modal state - Cmd/Ctrl+G toggles it.
  // Scope: chat view only, with an active session and working directory.
  const [gitModalOpen, setGitModalOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!shortcutsEnabled) return;
      if (!activeSession) return;
      if (!cwd) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setGitModalOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutsEnabled, activeSession, cwd]);

  // Search Everything - Double Shift opens the unified search palette.
  // Any other key between the two Shifts resets the sequence.
  const [searchOpen, setSearchOpen]   = useState(false);
  const [recentOpen, setRecentOpen]   = useState(false);
  const [viewFile, setViewFile] = useState<{ absolutePath: string; lineNumber: number } | null>(null);
  const lastShiftTs = useRef<number>(0);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const delta = now - lastShiftTs.current;
        if (delta > 0 && delta < 300) {
          e.preventDefault();
          setSearchOpen((v) => !v);
          lastShiftTs.current = 0;
        } else {
          lastShiftTs.current = now;
        }
      } else {
        // Any non-Shift key resets the sequence.
        lastShiftTs.current = 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Recent Files — Cmd+E toggles the palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setRecentOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Shared handler: open a file in the viewer and record it in recent history.
  const handleOpenFile = useCallback((absolutePath: string, lineNumber: number) => {
    pushRecentFile(absolutePath, lineNumber);
    setViewFile({ absolutePath, lineNumber });
  }, []);

  const handleSddModeChange = (next: 'auto' | 'off') => {
    setSddMode(next);
    void sdd.setMode(next);
    if (activeSession) {
      void updateSessionMeta(activeSession, { sddMode: next });
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      {/* ── Header ── */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex-1" />
        <div className="flex items-center gap-2 max-w-120">
          {(() => {
            if (!sdd.state || sdd.state.mode === 'off') return null;
            const entity = sdd.state.entities.length === 1
              ? sdd.state.entities[0]
              : sdd.state.entities.find(
                  (e) => e.rootPath === sdd.state?.activeEntityRootPath,
                );
            if (!entity) return null;
            const phase = deriveEntityPhase(entity.features, entity.hasConstitution);
            // Find the feature that's setting the current phase for the tooltip.
            const blockingFeature = entity.features.find((f) => f.currentPhase === phase);
            const progress = blockingFeature ? taskProgress(blockingFeature.artifacts) : null;
            const blockingProgress = progress
              ? `${progress.checked}/${progress.total} tasks`
              : undefined;
            return (
              <SddPhaseBadge
                phase={phase}
                entityName={entity.name}
                blockingFeatureName={blockingFeature?.slug}
                blockingProgress={blockingProgress}
                blockingFeature={blockingFeature}
                onPhaseAction={(text) => setPendingMessage(text)}
              />
            );
          })()}
          <h2 className="truncate text-[15px] font-semibold text-fg">
            {title}
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1">
          <IconButton
            icon={GitBranch}
            label="Git changes (Cmd+G)"
            onClick={() => setGitModalOpen(true)}
          />
          <IconButton
            icon={PanelRight}
            label={sddPanelOpen ? 'Close workspace panel' : 'Open workspace panel'}
            onClick={() => setSddPanelOpen((v) => !v)}
            className={sddPanelOpen ? 'text-accent' : ''}
          />
          <IconButton icon={X} label="New" onClick={onNewSession} />
        </div>
      </header>

      {/* ── Body: resizable chat + optional SDD right panel ── */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 min-h-0"
        onLayout={sddPanelOpen ? onWorkspaceLayout : undefined}
      >
        {/* Chat column */}
        <ResizablePanel
          defaultSize={sddPanelOpen ? workspaceLayout[0] : 100}
          minSize={40}
        >
          <div className="flex h-full min-h-0 flex-col">
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
                    onBranch={isStreaming ? undefined : (id) => void handleBranch(id)}
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
                  pendingMessage={pendingMessage}
                  onPendingMessageConsumed={() => setPendingMessage(undefined)}
                />
              </div>
            </div>

            <PermissionPrompt />
          </div>
        </ResizablePanel>

        {/* SDD right panel */}
        {sddPanelOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel
              defaultSize={workspaceLayout[1]}
              minSize={20}
              maxSize={55}
            >
              <SddWorkspacePanel
                activeSession={activeSession ?? ''}
                sddMode={sddMode}
                sddState={sdd.state}
                sddLoading={sdd.loading}
                isStreaming={isStreaming}
                onModeChange={handleSddModeChange}
                onRefreshScan={sdd.refreshScan}
                onMappingChange={(svcPath, entityRoot) =>
                  void sdd.setMapping({ servicePath: svcPath, entityRootPath: entityRoot })
                }
                onNewProject={() => setShowWizard(true)}
                onClose={() => setSddPanelOpen(false)}
                onPinFeature={(slug) => void sdd.setActiveFeature(slug)}
                onSendMessage={(text) => setPendingMessage(text)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* SDD Wizard dialog */}
      {showWizard && (
        <SddWizardDialog
          onClose={() => setShowWizard(false)}
          onSuccess={(newSessionId) => {
            setShowWizard(false);
            onSessionCreated(newSessionId);
            sdd.refreshScan();
          }}
        />
      )}

      {gitModalOpen && (
        <GitDiffModal
          cwd={cwd ?? null}
          connectionSlug={sessionConnectionSlug || undefined}
          model={sessionModel || undefined}
          sessionId={activeSession ?? undefined}
          onClose={() => setGitModalOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchModal
          cwd={cwd}
          onClose={() => setSearchOpen(false)}
          onOpenFile={(absolutePath, lineNumber) => {
            setSearchOpen(false);
            handleOpenFile(absolutePath, lineNumber);
          }}
        />
      )}

      {recentOpen && (
        <RecentFilesModal
          onClose={() => setRecentOpen(false)}
          onOpenFile={(absolutePath, lineNumber) => {
            setRecentOpen(false);
            handleOpenFile(absolutePath, lineNumber);
          }}
        />
      )}

      {viewFile && (
        <FileViewModal
          absolutePath={viewFile.absolutePath}
          lineNumber={viewFile.lineNumber}
          onClose={() => setViewFile(null)}
        />
      )}
    </main>
  );
}
