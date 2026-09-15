import { Archive, ArchiveRestore, Plus, Search, Trash2, X } from 'lucide-react';
import { Button, IconButton, Input } from '../../ui';
import type { Project } from '@/lib/electron';
import type { ProjectFilter, View } from '../TopBar';
import { projectFilterLabel } from '../top-bar/project-filter';
import { ProjectSwitcher } from '../top-bar/ProjectSwitcher';

type SessionsPanelHeaderProps = {
  view: View;
  projectFilter: ProjectFilter;
  projects: Project[];
  searchMode: boolean;
  query: string;
  selectedCount: number;
  onProjectFilterChange: (filter: ProjectFilter) => void;
  onManageProjects: () => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onQueryChange: (query: string) => void;
  onArchiveSelected: () => void;
  onRestoreSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onNewSession?: () => void;
};

export function SessionsPanelHeader({
  view,
  projectFilter,
  projects,
  searchMode,
  query,
  selectedCount,
  onProjectFilterChange,
  onManageProjects,
  onOpenSearch,
  onCloseSearch,
  onQueryChange,
  onArchiveSelected,
  onRestoreSelected,
  onDeleteSelected,
  onClearSelection,
  onNewSession,
}: SessionsPanelHeaderProps) {
  if (searchMode) {
    return (
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <Search className="ml-1 h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <Input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCloseSearch();
            }
          }}
          placeholder="Search by name…"
          className="h-7 border-0 bg-transparent px-1"
        />
        <IconButton icon={X} label="Close search" size="sm" onClick={onCloseSearch} />
      </header>
    );
  }

  const heading = view === 'archived' ? 'Archived' : projectFilterLabel(projectFilter, projects);
  const title =
    view === 'all' ? (
      <ProjectSwitcher
        value={projectFilter}
        onChange={onProjectFilterChange}
        onManage={onManageProjects}
      />
    ) : (
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        {view === 'archived' && <Archive className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />}
        {heading}
      </h2>
    );

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
      {title}
      <div className="flex items-center gap-1">
        <IconButton icon={Search} label="Search sessions" size="sm" onClick={onOpenSearch} />
        {selectedCount > 0 && (
          <>
            <span className="px-1 text-xs text-fg-muted">{selectedCount} selected</span>
            <IconButton
              icon={view === 'archived' ? ArchiveRestore : Archive}
              label={
                view === 'archived' ? 'Restore selected sessions' : 'Archive selected sessions'
              }
              size="sm"
              onClick={view === 'archived' ? onRestoreSelected : onArchiveSelected}
            />
            <IconButton
              icon={Trash2}
              label="Delete selected sessions"
              size="sm"
              className="text-red-400 hover:text-red-300"
              onClick={onDeleteSelected}
            />
            <IconButton icon={X} label="Clear selection" size="sm" onClick={onClearSelection} />
          </>
        )}
        {view === 'all' && selectedCount === 0 && onNewSession && (
          <Button
            variant="outline"
            size="sm"
            icon={Plus}
            onClick={onNewSession}
            className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
          >
            New
          </Button>
        )}
      </div>
    </header>
  );
}
