import { useState } from 'react';
import { Archive, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deleteSession,
  regenerateSessionTitle,
  setSessionProject,
  updateSessionMeta,
} from '@/lib/sessions';
import type { Project, SessionMeta } from '@/lib/electron';
import { Tooltip } from '../../ui';
import { RunningDot } from './RunningDot';
import { SessionRowActions } from './SessionRowActions';
import { relativeTime } from './utils';

export interface SessionRowProps {
  session: SessionMeta;
  active?: boolean;
  projects: Project[];
  showProjectDot: boolean;
  isStreaming?: boolean;
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
    ? (projects.find((candidate) => candidate.id === session.projectId) ?? null)
    : null;

  const handleRename = () => {
    setRenameValue(session.title);
    setRenaming(true);
  };
  const commitRename = async () => {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === session.title) return;
    await updateSessionMeta(session.id, { title: trimmed });
  };
  const handleRegenerateTitle = async () => {
    setRegenerating(true);
    try {
      await regenerateSessionTitle(session.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to regenerate title.');
    } finally {
      setRegenerating(false);
    }
  };
  const handleDelete = async () => {
    if (!window.confirm(`Delete "${session.title}"? This cannot be undone.`)) return;
    await deleteSession(session.id);
    if (active) onAfterDelete();
  };

  const selectionIcon = selected ? (
    <CheckCircle2
      className="h-4.5 w-4.5 shrink-0 text-accent"
      style={{ transform: 'translate(-1.5px, -1.5px)' }}
      strokeWidth={1.75}
    />
  ) : isStreaming ? (
    <RunningDot title="Running…" />
  ) : (
    <span
      className="h-1.5 w-1.5 rounded-full"
      style={{
        backgroundColor: project?.color ?? 'var(--color-fg-subtle)',
        opacity: project ? 1 : 0.4,
      }}
    />
  );

  const leadingIcon = showProjectDot ? (
    <Tooltip content={project ? `Project: ${project.name}` : 'Unassigned'}>
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: project?.color ?? 'var(--color-fg-subtle)',
          opacity: project ? 1 : 0.4,
        }}
      />
    </Tooltip>
  ) : session.archived ? (
    <Archive className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
  ) : (
    <Circle className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
  );

  return (
    <div
      className={cn(
        'group/session relative border-b border-border/60',
        '[&:has(button:hover)]:border-b-transparent',
        '[&:has(+_[data-active])]:border-b-transparent',
        '[&:has(+_div:has(button:hover))]:border-b-transparent',
        active && 'border-b-transparent',
      )}
      data-active={active ? '' : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      {active && <span className="absolute inset-y-1 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />}

      {renaming ? (
        <div
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2.5',
            active ? 'bg-elevated' : 'bg-panel',
          )}
        >
          {isStreaming ? <RunningDot title="Running…" /> : leadingIcon}
          <input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void commitRename();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            onBlur={() => void commitRename()}
            onClick={(event) => event.stopPropagation()}
            className="flex-1 min-w-0 rounded border border-accent bg-elevated px-1.5 py-0.5 text-[0.95rem] text-fg outline-none"
          />
        </div>
      ) : (
        <div
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2.5 transition-colors',
            active ? 'bg-elevated' : 'hover:bg-elevated/60',
            selected && 'bg-elevated/60',
          )}
        >
          <button
            type="button"
            aria-label={selected ? `Deselect ${session.title}` : `Select ${session.title}`}
            aria-pressed={selected}
            onClick={onToggleSelect}
            className={cn(
              'grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
              selected || isStreaming ? 'border border-transparent' : 'border hover:brightness-125',
            )}
            style={
              selected || isStreaming
                ? undefined
                : {
                    borderColor: project?.color ?? 'var(--color-fg-subtle)',
                    opacity: project ? 1 : 0.55,
                  }
            }
          >
            {selectionIcon}
          </button>
          <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex-1 truncate text-[0.95rem]',
                    regenerating ? 'italic text-fg-muted' : 'text-fg',
                  )}
                >
                  {regenerating ? 'Regenerating title…' : session.title}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs group-hover/session:invisible',
                    isStreaming ? 'font-medium text-accent' : 'text-fg-subtle',
                    menuOpen && 'invisible',
                  )}
                >
                  {isStreaming ? 'Running…' : relativeTime(session.lastMessageAt)}
                </span>
              </div>
            </div>
          </button>
        </div>
      )}

      <div
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 transition-opacity',
          'opacity-0 group-hover/session:opacity-100',
          menuOpen && 'opacity-100',
          renaming && 'opacity-0! pointer-events-none',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <SessionRowActions
          session={session}
          projects={projects}
          open={menuOpen}
          regenerating={regenerating}
          onOpenChange={setMenuOpen}
          onRename={handleRename}
          onRegenerateTitle={() => void handleRegenerateTitle()}
          onArchiveToggle={() =>
            void updateSessionMeta(session.id, { archived: !session.archived })
          }
          onReveal={() => void window.api.sessions.revealInFolder(session.id)}
          onMoveTo={(projectId) => void setSessionProject(session.id, projectId)}
          onDelete={() => void handleDelete()}
        />
      </div>
    </div>
  );
}
