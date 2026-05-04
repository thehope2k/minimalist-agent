import { useEffect, useRef, useState } from 'react';
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
import { useSkills } from './hooks/useSkills';
import { useExtensions } from './hooks/useExtensions';
import { useSessions } from './hooks/useSessions';
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

  const intentNewChatRef = useRef(false);

  const handleNewSession = () => {
    intentNewChatRef.current = true;
    setActiveSessionId(null);
    if (inSettings || inSkills || inExtensions) setView('all');
  };

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
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
