import type { Dispatch, SetStateAction } from 'react';
import { TopBar } from '../layout/TopBar';
import { UpdateBanner } from '../UpdateBanner';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { FileViewModal } from '../search/FileViewModal';
import { DesktopPetGate } from '../pet/DesktopPetGate';
import { TooltipProvider, ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui';
import { MainContent } from './MainContent';
import { AppSidePanel } from './AppSidePanel';
import { AppSidebarPanel } from './AppSidebarPanel';
import { PANEL_CARD } from './types';
import type { usePanelStates } from './usePanelStates';
import type { useProjectFilter, useSessionManagement } from './useSessionManagement';
import type { useViewNavigation } from './useViewNavigation';
import type { useResizablePanels } from '@/hooks/useResizablePanels';

interface AppLayoutProps {
  navigation: ReturnType<typeof useViewNavigation>;
  panels: ReturnType<typeof usePanelStates>;
  sessionState: ReturnType<typeof useSessionManagement>;
  projectState: ReturnType<typeof useProjectFilter>;
  activeCwd: string | undefined;
  setActiveCwd: Dispatch<SetStateAction<string | undefined>>;
  viewFile: { absolutePath: string; lineNumber: number } | null;
  setViewFile: Dispatch<SetStateAction<{ absolutePath: string; lineNumber: number } | null>>;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
  mainPanels: ReturnType<typeof useResizablePanels>;
  terminalPanels: ReturnType<typeof useResizablePanels>;
  explorerPanels: ReturnType<typeof useResizablePanels>;
}

export function AppLayout({
  navigation,
  panels,
  sessionState,
  projectState,
  activeCwd,
  setActiveCwd,
  viewFile,
  setViewFile,
  onOpenFile,
  mainPanels,
  terminalPanels,
  explorerPanels,
}: AppLayoutProps) {
  const {
    view,
    setView,
    settingsCategory,
    setActiveSkillSlug,
    setActiveAgentSlug,
    setActiveExtensionSlug,
    inSettings,
    inSkills,
    inAgents,
    inExtensions,
    activeSkill,
    activeAgent,
    activeExtension,
  } = navigation;
  const {
    sidebarCollapsed,
    terminalOpen,
    activeSidePanel,
    fileExplorerOpen,
    terminalPanelRef,
    sidePanelRef,
    toggleSidebar,
    toggleTerminal,
    toggleFileExplorer,
    toggleContextPanel,
  } = panels;
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
  } = sessionState;
  const { projectFilter } = projectState;

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-app text-fg">
        <TopBar
          view={view}
          onViewChange={setView}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          terminalOpen={terminalOpen}
          onToggleTerminal={toggleTerminal}
        />
        <UpdateBanner />
        <div className="min-h-0 flex-1 px-1.5 pb-1.5">
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={mainPanels.defaultLayout}
            onLayoutChange={mainPanels.onLayoutChange}
          >
            <AppSidebarPanel
              navigation={navigation}
              panels={panels}
              sessionState={sessionState}
              projectState={projectState}
              mainPanels={mainPanels}
            />
            <ResizableHandle />
            <ResizablePanel
              id="main-right"
              defaultSize={mainPanels.defaultSizesFromLayout[1]}
              minSize="30%"
            >
              <ResizablePanelGroup
                orientation="vertical"
                defaultLayout={terminalPanels.defaultLayout}
                onLayoutChange={terminalPanels.onLayoutChange}
              >
                <ResizablePanel
                  id="term-top"
                  defaultSize={terminalPanels.defaultSizesFromLayout[0]}
                  minSize="25%"
                >
                  <ResizablePanelGroup
                    orientation="horizontal"
                    defaultLayout={explorerPanels.defaultLayout}
                    onLayoutChange={explorerPanels.onLayoutChange}
                  >
                    <ResizablePanel
                      id="explorer-main"
                      defaultSize={explorerPanels.defaultSizesFromLayout[0]}
                      minSize="50%"
                    >
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
                            projectFilter === 'all' || projectFilter === 'inbox'
                              ? null
                              : projectFilter
                          }
                          onStreamingChange={setStreamingSessionIds}
                          onCwdChange={setActiveCwd}
                          onOpenFile={onOpenFile}
                          onToggleFileExplorer={toggleFileExplorer}
                          onToggleContextPanel={toggleContextPanel}
                          fileExplorerOpen={fileExplorerOpen}
                          startSessionWithSubmission={startSessionWithSubmission}
                        />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel
                      id="explorer-side"
                      panelRef={sidePanelRef}
                      defaultSize={explorerPanels.defaultSizesFromLayout[1]}
                      minSize="15%"
                      maxSize="40%"
                      collapsible
                      collapsedSize={0}
                      onResize={() => {}}
                    >
                      <div className={PANEL_CARD}>
                        <AppSidePanel
                          activeSidePanel={activeSidePanel}
                          activeCwd={activeCwd}
                          activeSessionId={activeSessionId}
                          fileExplorerOpen={fileExplorerOpen}
                          sessions={sessions}
                          onOpenFile={onOpenFile}
                          onToggleFileExplorer={toggleFileExplorer}
                          onToggleContextPanel={toggleContextPanel}
                          startSessionWithSubmission={startSessionWithSubmission}
                        />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel
                  id="term-bottom"
                  panelRef={terminalPanelRef}
                  defaultSize={terminalPanels.defaultSizesFromLayout[1]}
                  minSize="15%"
                  maxSize="70%"
                  collapsible
                  collapsedSize={0}
                  onResize={() => {}}
                >
                  <div className={PANEL_CARD}>
                    <TerminalPanel
                      isOpen={terminalOpen}
                      initialCwd={activeCwd}
                      onClose={toggleTerminal}
                      onOpenPath={onOpenFile}
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
            onOpenFile={onOpenFile}
          />
        )}
        <DesktopPetGate isStreaming={streamingSessionIds.size > 0} />
      </div>
    </TooltipProvider>
  );
}
