import { ResizablePanel } from '../ui';
import { LeftSidebar } from './LeftSidebar';
import { PANEL_CARD } from './types';
import type { usePanelStates } from './usePanelStates';
import type { useProjectFilter, useSessionManagement } from './useSessionManagement';
import type { useViewNavigation } from './useViewNavigation';
import type { useResizablePanels } from '@/hooks/useResizablePanels';

interface AppSidebarPanelProps {
  navigation: ReturnType<typeof useViewNavigation>;
  panels: ReturnType<typeof usePanelStates>;
  sessionState: ReturnType<typeof useSessionManagement>;
  projectState: ReturnType<typeof useProjectFilter>;
  mainPanels: ReturnType<typeof useResizablePanels>;
}

export function AppSidebarPanel({
  navigation,
  panels,
  sessionState,
  projectState,
  mainPanels,
}: AppSidebarPanelProps) {
  return (
    <ResizablePanel
      id="main-left"
      panelRef={panels.listPanelRef}
      defaultSize={mainPanels.defaultSizesFromLayout[0]}
      minSize="14%"
      maxSize="38%"
      collapsible
      collapsedSize={0}
      onResize={(size) => panels.setSidebarCollapsed(size.asPercentage === 0)}
    >
      <div className={PANEL_CARD}>
        <LeftSidebar
          view={navigation.view}
          inSettings={navigation.inSettings}
          inSkills={navigation.inSkills}
          inAgents={navigation.inAgents}
          inExtensions={navigation.inExtensions}
          settingsCategory={navigation.settingsCategory}
          onSettingsCategoryChange={navigation.setSettingsCategory}
          activeSkillSlug={navigation.activeSkillSlug}
          onSkillSelect={navigation.setActiveSkillSlug}
          activeAgentSlug={navigation.activeAgentSlug}
          onAgentSelect={navigation.setActiveAgentSlug}
          activeExtensionSlug={navigation.activeExtensionSlug}
          onExtensionSelect={navigation.setActiveExtensionSlug}
          activeSessionId={sessionState.activeSessionId}
          onSessionSelect={sessionState.setActiveSessionId}
          onActiveSessionDeleted={() => sessionState.setActiveSessionId(null)}
          projectFilter={projectState.projectFilter}
          onProjectFilterChange={projectState.setProjectFilter}
          onManageProjects={() => {
            navigation.setView('settings');
            navigation.setSettingsCategory('projects');
          }}
          onNewSession={sessionState.handleNewSession}
          onResumeNewSession={sessionState.handleResumeNewSession}
          streamingSessionIds={sessionState.streamingSessionIds}
          startSessionWithSubmission={sessionState.startSessionWithSubmission}
        />
      </div>
    </ResizablePanel>
  );
}
