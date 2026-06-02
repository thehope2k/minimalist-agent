import { useState, useCallback } from 'react';
import { TopBar } from './components/layout/TopBar';
import { UpdateBanner } from './components/UpdateBanner';
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { FileExplorerPanel } from './components/files';
import { FileViewModal } from './components/search/FileViewModal';
import { TooltipProvider, ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui';
import { useResizablePanels } from './hooks/useResizablePanels';
import { push as pushRecentFile } from './lib/recent-files';
import { LeftSidebar } from './components/app/LeftSidebar';
import { MainContent } from './components/app/MainContent';
import { useViewNavigation } from './components/app/useViewNavigation';
import { usePanelStates } from './components/app/usePanelStates';
import { useSessionManagement, useProjectFilter } from './components/app/useSessionManagement';
import { useKeyboardShortcuts } from './components/app/useKeyboardShortcuts';
import { useDataRefresh } from './components/app/useDataRefresh';
import { PANEL_CARD } from './components/app/types';

export type { SeedSubmit } from './components/app/types';

export default function App() {
  const {
    view,
    setView,
    settingsCategory,
    setSettingsCategory,
    activeSkillSlug,
    setActiveSkillSlug,
    activeAgentSlug,
    setActiveAgentSlug,
    activeExtensionSlug,
    setActiveExtensionSlug,
    inSettings,
    inSkills,
    inAgents,
    inExtensions,
    activeSkill,
    activeAgent,
    activeExtension,
  } = useViewNavigation();

  const { projectFilter, setProjectFilter } = useProjectFilter();

  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    terminalOpen,
    terminalOpenRef,
    fileExplorerOpen,
    listPanelRef,
    terminalPanelRef,
    fileExplorerPanelRef,
    toggleSidebar,
    toggleTerminal,
    toggleFileExplorer,
  } = usePanelStates();

  const {
    activeSessionId,
    setActiveSessionId,
    streamingSessionIds,
    setStreamingSessionIds,
    seedSubmit,
    setSeedSubmit,
    handleNewSession,
    startSessionWithSubmission,
    sessions,
  } = useSessionManagement(
    view,
    setView,
    projectFilter,
    inSettings,
    inSkills,
    inAgents,
    inExtensions,
  );

  const [activeCwd, setActiveCwd] = useState<string | undefined>(undefined);
  const [viewFile, setViewFile] = useState<{ absolutePath: string; lineNumber: number } | null>(null);

  const handleOpenFile = useCallback((absolutePath: string, lineNumber: number) => {
    pushRecentFile(absolutePath, lineNumber);
    setViewFile({ absolutePath, lineNumber });
  }, []);

  useKeyboardShortcuts(
    view,
    setView,
    toggleTerminal,
    toggleFileExplorer,
    handleNewSession,
    terminalOpenRef,
    terminalPanelRef,
    activeSessionId,
    sessions,
  );

  useDataRefresh();

  const { layout, onLayoutChange } = useResizablePanels('main-v3', [28, 72]);
  const { layout: termLayout, onLayoutChange: onTermLayout } = useResizablePanels('terminal-v1', [65, 35]);
  const { layout: explorerLayout, onLayoutChange: onExplorerLayoutChange } = useResizablePanels('explorer-v1', [100, 0]);

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
                <LeftSidebar
                  view={view}
                  inSettings={inSettings}
                  inSkills={inSkills}
                  inAgents={inAgents}
                  inExtensions={inExtensions}
                  settingsCategory={settingsCategory}
                  onSettingsCategoryChange={setSettingsCategory}
                  activeSkillSlug={activeSkillSlug}
                  onSkillSelect={setActiveSkillSlug}
                  activeAgentSlug={activeAgentSlug}
                  onAgentSelect={setActiveAgentSlug}
                  activeExtensionSlug={activeExtensionSlug}
                  onExtensionSelect={setActiveExtensionSlug}
                  activeSessionId={activeSessionId}
                  onSessionSelect={setActiveSessionId}
                  onActiveSessionDeleted={() => setActiveSessionId(null)}
                  projectFilter={projectFilter}
                  onNewSession={handleNewSession}
                  streamingSessionIds={streamingSessionIds}
                  startSessionWithSubmission={startSessionWithSubmission}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={layout[1]} minSize={30}>
              <ResizablePanelGroup direction="vertical" onLayout={onTermLayout}>
                <ResizablePanel defaultSize={termLayout[0]} minSize={25}>
                  <ResizablePanelGroup direction="horizontal" onLayout={onExplorerLayoutChange}>
                    <ResizablePanel defaultSize={explorerLayout[0]} minSize={50}>
                      <div className={PANEL_CARD}>
                        <MainContent
                          view={view}
                          inSettings={inSettings}
                          inSkills={inSkills}
                          inAgents={inAgents}
                          inExtensions={inExtensions}
                          settingsCategory={settingsCategory}
                          activeSkill={activeSkill}
                          onSkillClose={() => setActiveSkillSlug(null)}
                          activeAgent={activeAgent}
                          onAgentClose={() => setActiveAgentSlug(null)}
                          activeExtension={activeExtension}
                          onExtensionClose={() => setActiveExtensionSlug(null)}
                          activeSessionId={activeSessionId}
                          onSessionCreated={setActiveSessionId}
                          onNewSession={handleNewSession}
                          seedSubmit={seedSubmit}
                          onSeedSubmitConsumed={() => setSeedSubmit(null)}
                          newSessionDefaultProjectId={
                            projectFilter === 'all' || projectFilter === 'inbox' ? null : projectFilter
                          }
                          onStreamingChange={setStreamingSessionIds}
                          onCwdChange={setActiveCwd}
                          onOpenFile={handleOpenFile}
                          onToggleFileExplorer={toggleFileExplorer}
                          fileExplorerOpen={fileExplorerOpen}
                          startSessionWithSubmission={startSessionWithSubmission}
                        />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle />

                    <ResizablePanel
                      ref={fileExplorerPanelRef}
                      defaultSize={28}
                      minSize={15}
                      maxSize={40}
                      collapsible
                      collapsedSize={0}
                      onCollapse={() => {}}
                      onExpand={() => {}}
                    >
                      <div className={PANEL_CARD}>
                        <FileExplorerPanel
                          cwd={activeCwd}
                          sessionId={activeSessionId}
                          isOpen={fileExplorerOpen}
                          onSelectFile={(absolutePath) => handleOpenFile(absolutePath, 1)}
                          onClose={toggleFileExplorer}
                        />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel
                  ref={terminalPanelRef}
                  defaultSize={termLayout[1]}
                  minSize={15}
                  maxSize={70}
                  collapsible
                  collapsedSize={0}
                  onCollapse={() => {}}
                  onExpand={() => {}}
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

        {viewFile && (
          <FileViewModal
            absolutePath={viewFile.absolutePath}
            lineNumber={viewFile.lineNumber}
            onClose={() => setViewFile(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
