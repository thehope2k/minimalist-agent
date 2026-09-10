import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '../ui';
import { ViewTabs } from './top-bar/ViewTabs';
import { ActionButtons } from './top-bar/ActionButtons';
import type { TopBarProps } from './top-bar/types';

export type { View, ProjectFilter } from './top-bar/types';

/**
 * Top navigation bar — view tabs and terminal controls.
 */
export function TopBar({
  view,
  onViewChange,
  onToggleSidebar,
  sidebarCollapsed,
  terminalOpen,
  onToggleTerminal,
}: TopBarProps) {
  return (
    <div className="titlebar-drag relative flex h-12 shrink-0 items-center gap-1 bg-app px-2">
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

      <div className="absolute left-1/2 -translate-x-1/2">
        <ViewTabs view={view} onViewChange={onViewChange} />
      </div>

      <div className="flex-1" />

      <ActionButtons
        terminalOpen={terminalOpen}
        onToggleTerminal={onToggleTerminal}
      />
    </div>
  );
}
