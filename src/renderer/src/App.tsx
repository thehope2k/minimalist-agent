import { useEffect, useRef, useState, useCallback } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { TopBar, type ProjectFilter, type View } from './components/layout/TopBar';
import { UpdateBanner } from './components/UpdateBanner';
import { SessionsPanel } from './components/layout/SessionsPanel';
import { ChatArea } from './components/layout/ChatArea';
import {
  SettingsCategoriesPanel,
  type SettingsCategory,
} from './components/settings/SettingsCategoriesPanel';
import { SettingsContent } from './components/settings/SettingsContent';
import { SkillsPanel } from './components/skills/SkillsPanel';
import { SkillInfoPage } from './components/skills/SkillInfoPage';
import { ExtensionsPanel } from './components/extensions/ExtensionsPanel';
import { ExtensionInfoPage } from './components/extensions/ExtensionInfoPage';
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { TooltipProvider } from './components/ui';
import { useSkills } from './hooks/useSkills';
import { useExtensions } from './hooks/useExtensions';
import { useSessions } from './hooks/useSessions';
import { deleteSession } from './lib/sessions';
import { reload as reloadSkills } from './lib/skills';
import { reload as reloadExtensions } from './lib/extensions';

/** Payload pushed from non-chat surfaces (e.g. New Skill) into a fresh chat. */
export interface SeedSubmit {
  /** What the user sees in the chat transcript. */
  displayText: string;
  /** What the agent actually receives — typically wraps `displayText` with context. */
  agentText: string;
  /** Origin tag for the contextual chip above the user bubble. */
  intentTag: string;
}
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui';
import { useResizablePanels } from './hooks/useResizablePanels';

const PANEL_CARD =
  'h-full w-full overflow-hidden rounded-[10px] ring-1 ring-border-strong bg-panel';

const PROJECT_FILTER_KEY = 'minimalist:projectFilter';

export default function App() {
  const [view, setView] = useState<View>('all');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('ai');
  /** Currently selected session id; null = unsaved fresh chat. */
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** Every session id with a live agent turn (visible or not). */
  const [streamingSessionIds, setStreamingSessionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  /**
   * Sidebar project filter. Persisted in localStorage so the user lands back
   * on the same project after a relaunch. "all" / "inbox" are virtual; any
   * other string is a project id which may no longer exist (handled
   * gracefully by the switcher rendering "Project" as a fallback).
   */
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(() => {
    try {
      return (localStorage.getItem(PROJECT_FILTER_KEY) as ProjectFilter) || 'all';
    } catch {
      return 'all';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PROJECT_FILTER_KEY, projectFilter);
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [projectFilter]);

  // Two-column layout: list · detail. Nav lives in the top bar now.
  // Key bumped to v3 since both the column count and proportions changed.
  const { layout, onLayoutChange } = useResizablePanels('main-v3', [28, 72]);
  const listPanelRef = useRef<ImperativePanelHandle>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = () => {
    const p = listPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };

  // Terminal panel state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeCwd, setActiveCwd] = useState<string | undefined>(undefined);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const { layout: termLayout, onLayoutChange: onTermLayout } =
    useResizablePanels('terminal-v1', [65, 35]);

  const toggleTerminal = useCallback(() => {
    const p = terminalPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) {
      p.expand();
      setTerminalOpen(true);
    } else {
      p.collapse();
      setTerminalOpen(false);
    }
  }, []);

  // Keep a ref so keyboard handlers below always read the latest value
  // without needing to be re-registered on every toggle.
  const terminalOpenRef = useRef(false);
  terminalOpenRef.current = terminalOpen;
  // Stable refs for the delete shortcut — avoids re-registering the handler
  // on every session list or active-id change.
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  // Stable ref for handleNewSession — defined below but needed in the effect.
  const handleNewSessionRef = useRef<() => void>(() => {});

  // Cmd+T — global terminal toggle.
  // Cmd+N — new session (global).
  // Cmd+Shift+↑/↓ — resize terminal panel (gated: terminal open, focus not in text field).
  useEffect(() => {
    const isTextInput = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // xterm.js focuses an internal textarea for key capture — don't treat it
      // as a user text field or resize shortcuts silently stop working.
      if (t.tagName === 'TEXTAREA' && t.closest('.xterm')) return false;
      return (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+T — toggle terminal
      if (e.key === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleTerminal();
        return;
      }

      // Cmd+N — new session
      if (e.key === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleNewSessionRef.current();
        return;
      }

      // Cmd+S — jump to Sessions view
      if (e.key === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setView('all');
        return;
      }

      // Cmd+, — jump to Settings view (universal macOS convention)
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setView('settings');
        return;
      }

      // Cmd+Delete — delete the active session (with confirmation)
      if (e.key === 'Backspace' && !e.shiftKey && !e.altKey) {
        const sid = activeSessionIdRef.current;
        if (!sid) return; // no active session (new-session state)
        const t = e.target as HTMLElement;
        // Don't fire when the user is typing in a text field.
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
        e.preventDefault();
        const session = sessionsRef.current?.find((s) => s.id === sid);
        const label = session?.title?.trim() || 'this session';
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        void deleteSession(sid).then(() => setActiveSessionId(null));
        return;
      }

      // Resize shortcuts — only when terminal is open and focus not in a text field
      if (!terminalOpenRef.current || isTextInput(e)) return;

      const RESIZE_STEP = 3;
      if (e.key === 'ArrowUp' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const p = terminalPanelRef.current;
        if (p) p.resize(Math.min(p.getSize() + RESIZE_STEP, 70));
        return;
      }
      if (e.key === 'ArrowDown' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const p = terminalPanelRef.current;
        if (p) p.resize(Math.max(p.getSize() - RESIZE_STEP, 15));
        return;
      }
    };

    // capture: true so this fires before xterm can call stopPropagation.
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [toggleTerminal]);

  // Collapse terminal on mount (starts closed).
  // Also keep handleNewSessionRef current after it is defined below.

  const inSettings = view === 'settings';
  const inSkills = view === 'skills';
  const inExtensions = view === 'extensions';
  const [activeSkillSlug, setActiveSkillSlug] = useState<string | null>(null);
  const [activeExtensionSlug, setActiveExtensionSlug] = useState<string | null>(
    null,
  );
  const skills = useSkills();
  const extensions = useExtensions();
  const sessions = useSessions();
  // Stable ref for the delete shortcut — avoids re-registering the handler
  // on every session list or active-id change.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeSkill = inSkills
    ? skills?.find((s) => s.slug === activeSkillSlug) ?? null
    : null;
  const activeExtension = inExtensions
    ? extensions?.find((e) => e.slug === activeExtensionSlug) ?? null
    : null;

  useEffect(() => {
    if (!inSkills || !activeSkillSlug || !skills) return;
    if (!skills.some((s) => s.slug === activeSkillSlug)) {
      setActiveSkillSlug(null);
    }
  }, [inSkills, activeSkillSlug, skills]);

  useEffect(() => {
    if (!inExtensions || !activeExtensionSlug || !extensions) return;
    if (!extensions.some((e) => e.slug === activeExtensionSlug)) {
      setActiveExtensionSlug(null);
    }
  }, [inExtensions, activeExtensionSlug, extensions]);

  // Whenever a chat turn ends, the agent may have written a new SKILL.md
  // or extension files via the Write tool. Refresh both caches.
  useEffect(() => {
    if (!window.api?.chat) return;
    return window.api.chat.onEvent((evt) => {
      if (evt.type === 'turn_done') {
        void reloadSkills();
        void reloadExtensions();
      }
    });
  }, []);

  // Ensure the terminal panel starts collapsed on first render.
  useEffect(() => {
    terminalPanelRef.current?.collapse();
  }, []);

  const intentNewChatRef = useRef(false);

  const handleNewSession = () => {
    intentNewChatRef.current = true;
    setActiveSessionId(null);
    if (inSettings || inSkills || inExtensions) setView('all');
  };
  handleNewSessionRef.current = handleNewSession;

  // Reset the "explicit new chat" flag once the chat materialises.
  useEffect(() => {
    if (activeSessionId !== null) intentNewChatRef.current = false;
  }, [activeSessionId]);

  useEffect(() => {
    if (view !== 'all') return;
    if (activeSessionId !== null) return;
    if (intentNewChatRef.current) return;
    if (!sessions || sessions.length === 0) return;
    const latest = sessions
      .filter((s) => !s.archived)
      .filter((s) => {
        if (projectFilter === 'all') return true;
        if (projectFilter === 'inbox') return !s.projectId;
        return s.projectId === projectFilter;
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];
    if (latest) setActiveSessionId(latest.id);
  }, [view, activeSessionId, sessions, projectFilter]);

  /**
   * Structured submission seeded into a fresh chat (e.g. from "+ New
   * Skill"). The agent gets `agentText`; the chat transcript shows
   * `displayText` with an intent chip. Cleared after the chat consumes it.
   */
  const [seedSubmit, setSeedSubmit] = useState<SeedSubmit | null>(null);
  const startSessionWithSubmission = (submit: SeedSubmit) => {
    setSeedSubmit(submit);
    setActiveSessionId(null);
    setView('all');
  };

  return (
    <TooltipProvider>
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app text-fg">
      <TopBar
        view={view}
        onViewChange={setView}
        onToggleSidebar={toggleSidebar}
        sidebarCollapsed={sidebarCollapsed}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        onManageProjects={() => {
          setView('settings');
          setSettingsCategory('projects');
        }}
        terminalOpen={terminalOpen}
        onToggleTerminal={toggleTerminal}
      />

      <UpdateBanner />

      <div className="min-h-0 flex-1 px-1.5 pb-1.5">
        <ResizablePanelGroup direction="horizontal" onLayout={onLayoutChange}>
          <ResizablePanel
            ref={listPanelRef}
            defaultSize={layout[0]}
            minSize={14}
            maxSize={38}
            collapsible
            collapsedSize={0}
            onCollapse={() => setSidebarCollapsed(true)}
            onExpand={() => setSidebarCollapsed(false)}
          >
            <div className={PANEL_CARD}>
              {inSettings ? (
                <SettingsCategoriesPanel
                  active={settingsCategory}
                  onChange={setSettingsCategory}
                />
              ) : inSkills ? (
                <SkillsPanel
                  activeSlug={activeSkillSlug}
                  onSelect={setActiveSkillSlug}
                  onStartChatWithSubmission={startSessionWithSubmission}
                />
              ) : inExtensions ? (
                <ExtensionsPanel
                  activeSlug={activeExtensionSlug}
                  onSelect={setActiveExtensionSlug}
                  onStartChatWithSubmission={startSessionWithSubmission}
                />
              ) : (
                <SessionsPanel
                  view={view}
                  activeId={activeSessionId}
                  projectFilter={projectFilter}
                  onSelect={setActiveSessionId}
                  onActiveDeleted={() => setActiveSessionId(null)}
                  onNewSession={handleNewSession}
                  streamingSessionIds={streamingSessionIds}
                />
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={layout[1]} minSize={30}>
            <ResizablePanelGroup direction="vertical" onLayout={onTermLayout}>
              {/* Main content area */}
              <ResizablePanel defaultSize={termLayout[0]} minSize={25}>
                <div className={PANEL_CARD}>
                  <div
                    className="h-full w-full"
                    style={{
                      display:
                        inSettings || inSkills || inExtensions ? 'none' : 'block',
                    }}
                  >
                    <ChatArea
                      sessionId={activeSessionId}
                      onSessionCreated={setActiveSessionId}
                      onNewSession={handleNewSession}
                      seedSubmit={seedSubmit}
                      onSeedSubmitConsumed={() => setSeedSubmit(null)}
                      newSessionDefaultProjectId={
                        projectFilter === 'all' || projectFilter === 'inbox'
                          ? null
                          : projectFilter
                      }
                      onStreamingChange={setStreamingSessionIds}
                      onCwdChange={setActiveCwd}
                    />
                  </div>
                  {inSettings && <SettingsContent category={settingsCategory} />}
                  {inSkills && (
                    <SkillInfoPage
                      skill={activeSkill}
                      onClose={() => setActiveSkillSlug(null)}
                      onStartChatWithSubmission={startSessionWithSubmission}
                    />
                  )}
                  {inExtensions && (
                    <ExtensionInfoPage
                      extension={activeExtension}
                      onClose={() => setActiveExtensionSlug(null)}
                    />
                  )}
                </div>
              </ResizablePanel>

              <ResizableHandle />

              {/* Terminal panel — collapsible, stays mounted across toggles */}
              <ResizablePanel
                ref={terminalPanelRef}
                defaultSize={termLayout[1]}
                minSize={15}
                maxSize={70}
                collapsible
                collapsedSize={0}
                onCollapse={() => setTerminalOpen(false)}
                onExpand={() => setTerminalOpen(true)}
              >
                <div className={PANEL_CARD}>
                  <TerminalPanel
                    isOpen={terminalOpen}
                    initialCwd={activeCwd}
                    onClose={toggleTerminal}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
    </TooltipProvider>
  );
}
