import { useState } from 'react';
import { Archive, ArchiveRestore, CheckSquare, Plus, Trash2, X } from 'lucide-react';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { deleteSession, updateSessionMeta } from '@/lib/sessions';
import { Button, IconButton } from '../ui';
import { cn } from '@/lib/utils';
import { useHasNewSessionDraft } from '@/hooks/useHasNewSessionDraft';
import type { ProjectFilter, View } from './TopBar';
import { SessionRow } from './sessions-panel/SessionRow';
import { groupByDate } from './sessions-panel/utils';
import { Circle } from 'lucide-react';

type Props = {
  view: View;
  activeId?: string | null;
  projectFilter: ProjectFilter;
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
  onSelect,
  onActiveDeleted,
  onNewSession,
  onResumeNewSession,
  streamingSessionIds,
}: Props) {
  const sessions = useSessions();
  const projects = useProjects() ?? [];
  const hasNewSessionDraft = useHasNewSessionDraft();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const heading =
    view === 'archived' ? 'Archived'
    : projectFilter === 'inbox' ? 'Inbox'
    : projectFilter === 'all' ? 'All Sessions'
    : projects.find((p) => p.id === projectFilter)?.name ?? 'Sessions';

  const showProjectDot = view !== 'archived' && projectFilter === 'all';

  if (sessions === null) {
    return (
      <section className="flex h-full w-full flex-col bg-panel">
        <header className="flex h-10 shrink-0 items-center border-b border-border px-3">
          <h2 className="text-[15px] font-semibold text-fg">{heading}</h2>
        </header>
        <div className="px-3 py-6 text-center text-xs text-fg-subtle">Loading…</div>
      </section>
    );
  }

  const items = sessions
    .filter((s) => (view === 'archived' ? s.archived : !s.archived))
    .filter((s) => {
      if (view === 'archived') return true;
      if (projectFilter === 'all') return true;
      if (projectFilter === 'inbox') return !s.projectId;
      return s.projectId === projectFilter;
    });

  /* ---- bulk selection helpers ---- */
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelectedIds(new Set(items.map((s) => s.id)));

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} session${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    await Promise.all(ids.map((id) => deleteSession(id)));
    const deletedActive = activeId && selectedIds.has(activeId);
    exitSelectMode();
    if (deletedActive) onActiveDeleted?.();
  };

  const handleBulkArchive = async () => {
    if (!selectedIds.size) return;
    await Promise.all([...selectedIds].map((id) => updateSessionMeta(id, { archived: true })));
    exitSelectMode();
  };

  const handleBulkRestore = async () => {
    if (!selectedIds.size) return;
    await Promise.all([...selectedIds].map((id) => updateSessionMeta(id, { archived: false })));
    exitSelectMode();
  };

  return (
    <section className="relative flex h-full w-full flex-col bg-panel">
      {/* Normal header */}
      {!selectMode && (
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
          <h2 className="text-[15px] font-semibold text-fg">{heading}</h2>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <IconButton icon={CheckSquare} label="Select sessions" size="sm" onClick={() => setSelectMode(true)} />
            )}
            {view === 'all' && onNewSession && (
              <Button
                variant="outline" size="sm" icon={Plus}
                onClick={onNewSession}
                className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
              >
                New
              </Button>
            )}
          </div>
        </header>
      )}

      {/* Select-mode header */}
      {selectMode && (
        <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
          <span className="flex-1 truncate text-xs text-fg-muted">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select sessions'}
          </span>
          {selectedIds.size < items.length && (
            <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
          )}
          {view === 'archived' ? (
            <Button variant="ghost" size="sm" icon={ArchiveRestore}
              disabled={selectedIds.size === 0} onClick={() => void handleBulkRestore()}>
              Restore
            </Button>
          ) : (
            <Button variant="ghost" size="sm" icon={Archive}
              disabled={selectedIds.size === 0} onClick={() => void handleBulkArchive()}>
              Archive
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={Trash2}
            disabled={selectedIds.size === 0}
            className="text-red-400 hover:text-red-300"
            onClick={() => void handleBulkDelete()}>
            Delete
          </Button>
          <IconButton icon={X} label="Cancel selection" size="sm" onClick={exitSelectMode} />
        </header>
      )}

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        {view === 'all' && (activeId == null || hasNewSessionDraft) && (
          <NewSessionRow
            active={activeId == null}
            onSelect={onResumeNewSession ?? onNewSession}
          />
        )}

        {items.length === 0 && !(view === 'all' && activeId == null) ? (
          <div className="px-3 py-6 text-center text-xs text-fg-subtle">
            {view === 'archived' ? 'Nothing archived' : 'No sessions yet'}
          </div>
        ) : items.length > 0 ? (
          <>
            {groupByDate(items, view === 'archived').map(([label, group]) => (
              <div key={label}>
                {view !== 'archived' && (
                  <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                    {label}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  {group.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      active={s.id === activeId}
                      projects={projects}
                      showProjectDot={showProjectDot}
                      isStreaming={!!streamingSessionIds?.has(s.id)}
                      selectMode={selectMode}
                      selected={selectedIds.has(s.id)}
                      onClick={() => onSelect(s.id)}
                      onAfterDelete={() => onActiveDeleted?.()}
                      onToggleSelect={() => toggleSelect(s.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}

function NewSessionRow({ active, onSelect }: { active: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        active ? 'bg-elevated' : 'hover:bg-elevated/60 text-fg-muted',
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}
      <Circle
        className={cn('h-4 w-4 shrink-0', active ? 'text-fg-subtle' : 'text-fg-subtle/50')}
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            'flex-1 truncate text-[0.95rem]',
            active ? 'text-fg' : 'text-fg-muted',
          )}>
            New session
          </span>
          {active && <span className="shrink-0 text-xs text-fg-subtle">now</span>}
        </div>
      </div>
    </button>
  );
}
