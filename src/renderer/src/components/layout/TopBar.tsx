import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '../ui';
import { ViewTabs } from './top-bar/ViewTabs';
import { ProjectSwitcher } from './top-bar/ProjectSwitcher';
import { ActionButtons } from './top-bar/ActionButtons';
import type { TopBarProps } from './top-bar/types';

export type { View, ProjectFilter } from './top-bar/types';

/**
 * Top navigation bar — view tabs, project filtering, terminal toggle.
 * Orchestrates sidebar toggle, project switching, and navigation.
 */
export function TopBar({
  view,
  onViewChange,
  onToggleSidebar,
  sidebarCollapsed,
  projectFilter,
  onProjectFilterChange,
  onManageProjects,
  terminalOpen,
  onToggleTerminal,
}: TopBarProps) {
  return (
    <div className="titlebar-drag flex h-12 shrink-0 items-center gap-1 bg-app px-2">
      {/* macOS traffic-light spacer */}
      <div className="w-17 shrink-0" />

      <div className="titlebar-no-drag flex items-center gap-0.5">
        <IconButton
          icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
          label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          onClick={onToggleSidebar}
        />
      </div>

      <div className="w-2" />

      <ProjectSwitcher
        value={projectFilter}
        onChange={onProjectFilterChange}
        onManage={onManageProjects}
      />

      <ViewTabs view={view} onViewChange={onViewChange} />

      <div className="flex-1" />

      <ActionButtons
        terminalOpen={terminalOpen}
        onToggleTerminal={onToggleTerminal}
      />
    </div>
  );
}
