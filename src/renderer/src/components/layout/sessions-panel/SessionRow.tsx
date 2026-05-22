import { useState } from 'react';
import {
  Archive, ArchiveRestore, CheckSquare, Circle,
  FolderOpen, Inbox, MoreHorizontal, Pencil, Sparkles, Square, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deleteSession,
  regenerateSessionTitle,
  setSessionProject,
  updateSessionMeta,
} from '@/lib/sessions';
import { IconButton, Menu, type MenuItem } from '../../ui';
import type { Project, SessionSummary } from '@/lib/electron';
import { RunningDot } from './RunningDot';
import { relativeTime, revealLabel } from './utils';

export interface SessionRowProps {
  session: SessionSummary;
  active?: boolean;
  projects: Project[];
  showProjectDot: boolean;
  isStreaming?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onClick: () => void;
  onAfterDelete: () => void;
  onToggleSelect?: () => void;
}

export function SessionRow({
  session,
  active,
  projects,
  showProjectDot,
  isStreaming,
  selectMode,
  selected,
  onClick,
  onAfterDelete,
  onToggleSelect,
}: SessionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const project = session.projectId
    ? projects.find((p) => p.id === session.projectId) ?? null
    : null;

  const handleRename = () => { setRenameValue(session.title); setRenaming(true); };
  const commitRename = async () => {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === session.title) return;
    await updateSessionMeta(session.id, { title: trimmed });
  };
  const cancelRename = () => setRenaming(false);
  const handleArchiveToggle = async () => {
    await updateSessionMeta(session.id, { archived: !session.archived });
  };
  const handleDelete = async () => {
    if (!window.confirm(`Delete "${session.title}"? This cannot be undone.`)) return;
    await deleteSession(session.id);
    if (active) onAfterDelete();
  };
  const handleReveal = () => void window.api.sessions.revealInFolder(session.id);
  const handleRegenerateTitle = async () => {
    setRegenerating(true);
    try { await regenerateSessionTitle(session.id); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Failed to regenerate title.'); }
    finally { setRegenerating(false); }
  };
  const handleMoveTo = async (projectId: string | null) => {
    await setSessionProject(session.id, projectId);
  };

  const items: Array<MenuItem | 'separator'> = [
    { label: 'Rename', icon: Pencil, onSelect: handleRename },
    { label: regenerating ? 'Regenerating…' : 'Regenerate title', icon: Sparkles, onSelect: handleRegenerateTitle },
    {
      label: session.archived ? 'Restore' : 'Archive',
      icon: session.archived ? ArchiveRestore : Archive,
      onSelect: handleArchiveToggle,
    },
    { label: revealLabel(), icon: FolderOpen, onSelect: handleReveal },
    'separator',
    {
      label: session.projectId === null ? 'In Inbox ✓' : 'Move to Inbox',
      icon: Inbox,
      onSelect: () => void handleMoveTo(null),
    },
    ...projects.map<MenuItem>((p) => ({
      label: session.projectId === p.id ? `In ${p.name} ✓` : `Move to ${p.name}`,
      onSelect: () => void handleMoveTo(p.id),
    })),
    'separator',
    { label: 'Delete', icon: Trash2, variant: 'destructive', onSelect: handleDelete },
  ];

  const leadingIcon = selectMode ? (
    selected
      ? <CheckSquare className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
      : <Square className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
  ) : isStreaming ? (
    <RunningDot title="Running…" />
  ) : showProjectDot ? (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: project?.color ?? 'var(--color-fg-subtle)', opacity: project ? 1 : 0.4 }}
      title={project?.name ?? 'Inbox'}
    />
  ) : (
    <Circle className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
  );

  return (
    <div
      className={cn(
        'group/session relative border-b border-border/60 last:border-b-0',
        '[&:has(button:hover)]:border-b-transparent',
        '[&:has(+_[data-active])]:border-b-transparent',
        '[&:has(+_div:has(button:hover))]:border-b-transparent',
        active && 'border-b-transparent',
      )}
      data-active={active ? '' : undefined}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
    >
      {active && (
        <span className="absolute inset-y-1 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}

      {renaming ? (
        <div className={cn('flex w-full items-center gap-3 px-3 py-2.5', active ? 'bg-elevated' : 'bg-panel')}>
          {isStreaming ? <RunningDot title="Running…" /> : leadingIcon}
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
              if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
            }}
            onBlur={() => void commitRename()}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 rounded border border-accent bg-elevated px-1.5 py-0.5 text-[0.95rem] text-fg outline-none"
          />
        </div>
      ) : (
        <button
          onClick={selectMode ? onToggleSelect : onClick}
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
            active && !selectMode ? 'bg-elevated' : 'hover:bg-elevated/60',
            selectMode && selected && 'bg-elevated/60',
          )}
        >
          {leadingIcon}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn('flex-1 truncate text-[0.95rem]', regenerating ? 'italic text-fg-muted' : 'text-fg')}>
                {regenerating ? 'Regenerating title…' : session.title}
              </span>
              <span className={cn(
                'shrink-0 text-xs group-hover/session:invisible',
                isStreaming ? 'font-medium text-accent' : 'text-fg-subtle',
                menuOpen && 'invisible',
              )}>
                {isStreaming ? 'Running…' : relativeTime(session.lastMessageAt)}
              </span>
            </div>
          </div>
        </button>
      )}

      <div
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 transition-opacity',
          'opacity-0 group-hover/session:opacity-100',
          menuOpen && 'opacity-100',
          (renaming || selectMode) && '!opacity-0 pointer-events-none',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Menu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger={
            <IconButton
              icon={MoreHorizontal}
              label="More"
              size="sm"
              className="bg-elevated/80 hover:bg-elevated-2"
            />
          }
          items={items}
        />
      </div>
    </div>
  );
}
