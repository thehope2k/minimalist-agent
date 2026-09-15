import { useState } from 'react';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { deleteSession, updateSessionMeta } from '@/lib/sessions';
import { useHasNewSessionDraft } from '@/hooks/useHasNewSessionDraft';
import type { ProjectFilter, View } from './TopBar';
import { NewSessionRow } from './sessions-panel/NewSessionRow';
import { SessionRow } from './sessions-panel/SessionRow';
import { SessionsPanelHeader } from './sessions-panel/SessionsPanelHeader';
import { groupByDate } from './sessions-panel/utils';

type Props = {
  view: View;
  activeId?: string | null;
  projectFilter: ProjectFilter;
  onProjectFilterChange: (filter: ProjectFilter) => void;
  onManageProjects: () => void;
  onSelect: (id: string) => void;
  onActiveDeleted?: () => void;
  onNewSession?: () => void;
  /**
   * Return to an existing new-session draft without clearing it. Distinct
   * from `onNewSession`, which starts fresh and wipes the draft state.
   */
  onResumeNewSession?: () => void;
  streamingSessionIds?: ReadonlySet<string>;
};

export function SessionsPanel({
  view,
  activeId,
  projectFilter,
  onProjectFilterChange,
  onManageProjects,
  onSelect,
  onActiveDeleted,
  onNewSession,
  onResumeNewSession,
  streamingSessionIds,
}: Props) {
  const sessions = useSessions();
  const projects = useProjects() ?? [];
  const hasNewSessionDraft = useHasNewSessionDraft();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim().toLowerCase();

  const clearSelection = () => setSelectedIds(new Set());
  const closeSearch = () => {
    setSearchMode(false);
    setQuery('');
  };
  const toggleSelect = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (
      !window.confirm(
        `Delete ${ids.length} session${ids.length !== 1 ? 's' : ''}? This cannot be undone.`,
      )
    )
      return;
    await Promise.all(ids.map((id) => deleteSession(id)));
    const deletedActive = activeId && selectedIds.has(activeId);
    clearSelection();
    if (deletedActive) onActiveDeleted?.();
  };
  const updateSelectedArchiveState = async (archived: boolean) => {
    if (!selectedIds.size) return;
    await Promise.all([...selectedIds].map((id) => updateSessionMeta(id, { archived })));
    clearSelection();
  };

  const header = (
    <SessionsPanelHeader
      view={view}
      projectFilter={projectFilter}
      projects={projects}
      searchMode={searchMode}
      query={query}
      selectedCount={selectedIds.size}
      onProjectFilterChange={onProjectFilterChange}
      onManageProjects={onManageProjects}
      onOpenSearch={() => setSearchMode(true)}
      onCloseSearch={closeSearch}
      onQueryChange={setQuery}
      onArchiveSelected={() => void updateSelectedArchiveState(true)}
      onRestoreSelected={() => void updateSelectedArchiveState(false)}
      onDeleteSelected={() => void handleBulkDelete()}
      onClearSelection={clearSelection}
      onNewSession={onNewSession}
    />
  );

  if (sessions === null) {
    return (
      <section className="flex h-full w-full flex-col bg-panel">
        {header}
        <div className="px-3 py-6 text-center text-xs text-fg-subtle">Loading…</div>
      </section>
    );
  }

  const items = sessions
    .filter((session) => (view === 'archived' ? session.archived : !session.archived))
    .filter((session) => {
      if (view === 'archived' || projectFilter === 'all') return true;
      if (projectFilter === 'inbox') return !session.projectId;
      return session.projectId === projectFilter;
    })
    .filter((session) => {
      if (!trimmedQuery) return true;
      return (
        session.title.toLowerCase().includes(trimmedQuery) ||
        (session.workingDirectory?.toLowerCase().includes(trimmedQuery) ?? false)
      );
    });
  const showProjectDot = view !== 'archived' && projectFilter === 'all';
  const showNewSessionRow =
    view === 'all' && !trimmedQuery && (activeId == null || hasNewSessionDraft);
  const isEmpty = items.length === 0 && !(view === 'all' && !trimmedQuery && activeId == null);

  return (
    <section className="relative flex h-full w-full flex-col bg-panel">
      {header}
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        {showNewSessionRow && (
          <NewSessionRow active={activeId == null} onSelect={onResumeNewSession ?? onNewSession} />
        )}

        {isEmpty ? (
          <div className="px-3 py-6 text-center text-xs text-fg-subtle">
            {trimmedQuery
              ? `No sessions match “${query.trim()}”`
              : view === 'archived'
                ? 'Nothing archived'
                : 'No sessions yet'}
          </div>
        ) : (
          groupByDate(items).map(([label, group]) => (
            <div key={label}>
              <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                {label}
              </div>
              <div className="flex flex-col gap-1">
                {group.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={session.id === activeId}
                    projects={projects}
                    showProjectDot={showProjectDot}
                    isStreaming={!!streamingSessionIds?.has(session.id)}
                    selected={selectedIds.has(session.id)}
                    onClick={() => onSelect(session.id)}
                    onAfterDelete={() => onActiveDeleted?.()}
                    onToggleSelect={() => toggleSelect(session.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
