export type View = 'all' | 'archived' | 'skills' | 'agents' | 'extensions' | 'settings';

/** "all" = no project filter; "inbox" = sessions with projectId === null; otherwise a project id. */
export type ProjectFilter = 'all' | 'inbox' | string;

export interface TopBarProps {
  view: View;
  onViewChange: (v: View) => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  projectFilter: ProjectFilter;
  onProjectFilterChange: (f: ProjectFilter) => void;
  onManageProjects: () => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
}

export interface NavTabProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
}
