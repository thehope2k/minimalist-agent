import { useState } from 'react';
import { Archive, ArchiveRestore, Circle, FolderOpen, Inbox, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import {
  deleteSession,
  regenerateSessionTitle,
  setSessionProject,
  updateSessionMeta,
} from '@/lib/sessions';
import { Button, IconButton, Menu, type MenuItem } from '../ui';
import type { Project, SessionSummary } from '@/lib/electron';
import type { ProjectFilter, View } from './TopBar';

function SessionRow({
  session,
  active,
  projects,
  showProjectDot,
  isStreaming,
  onClick,
  onAfterDelete,
}: {
  session: SessionSummary;
  active?: boolean;
  projects: Project[];
  /** Render the project color dot in front of the title (only useful in "All Projects" view). */
  showProjectDot: boolean;
  /** True when this session has a live agent turn in flight. */
  isStreaming?: boolean;
  onClick: () => void;
  onAfterDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const project = session.projectId
    ? projects.find((p) => p.id === session.projectId) ?? null
    : null;

  const handleRename = async () => {
    // Native prompt — simple for v1; replace with an inline input later.
    const next = window.prompt('Rename session', session.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === session.title) return;
    await updateSessionMeta(session.id, { title: trimmed });
  };

  const handleArchiveToggle = async () => {
    await updateSessionMeta(session.id, { archived: !session.archived });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${session.title}"? This cannot be undone.`)) return;
    await deleteSession(session.id);
    if (active) onAfterDelete();
  };

  const handleReveal = () => {
    void window.api.sessions.revealInFolder(session.id);
  };

  const handleRegenerateTitle = async () => {
    try {
      await regenerateSessionTitle(session.id);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'Failed to regenerate title.',
      );
    }
  };

  const handleMoveTo = async (projectId: string | null) => {
    await setSessionProject(session.id, projectId);
  };

  const items: Array<MenuItem | 'separator'> = [
    { label: 'Rename', icon: Pencil, onSelect: handleRename },
    { label: 'Regenerate title', icon: Sparkles, onSelect: handleRegenerateTitle },
    {
      label: session.archived ? 'Restore' : 'Archive',
      icon: session.archived ? ArchiveRestore : Archive,
      onSelect: handleArchiveToggle,
    },
    { label: revealLabel(), icon: FolderOpen, onSelect: handleReveal },
    'separator',
    // "Move to" entries — Inbox first, then each project. Keeping them flat
    // avoids a nested submenu (the Menu primitive doesn't support those).
    {
      label: session.projectId === null ? 'In Inbox ✓' : 'Move to Inbox',
      icon: Inbox,
      onSelect: () => void handleMoveTo(null),
    },
    ...projects.map<MenuItem>((p) => ({
      label:
        session.projectId === p.id
          ? `In ${p.name} ✓`
          : `Move to ${p.name}`,
      onSelect: () => void handleMoveTo(p.id),
    })),
    'separator',
    { label: 'Delete', icon: Trash2, variant: 'destructive', onSelect: handleDelete },
  ];

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
      <button
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
          active ? 'bg-elevated' : 'hover:bg-elevated/60',
        )}
      >
        {isStreaming ? (
          <RunningDot title="Running…" />
        ) : showProjectDot ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: project?.color ?? 'var(--color-fg-subtle)',
              opacity: project ? 1 : 0.4,
            }}
            title={project?.name ?? 'Inbox'}
          />
        ) : (
          <Circle
            className="h-4 w-4 shrink-0 text-fg-subtle"
            strokeWidth={1.75}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-[0.95rem] text-fg">{session.title}</span>
            {/* Time hides while row is hovered OR the menu is open, so the
                "..." button can take over the same slot without layout shift.
                When streaming, the timestamp is replaced with "Running…" in
                accent color so the row reads as live at a glance. */}
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

      {/* The trigger stays mounted (so Radix can anchor the popover) and
          uses opacity, not display, to avoid losing its bounding rect when
          the user clicks it and hover ends. */}
      <div
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 transition-opacity',
          'opacity-0 group-hover/session:opacity-100',
          menuOpen && 'opacity-100',
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

/**
 * Live indicator shown in place of the project dot for streaming rows.
 * The outer span pings outward, the inner dot stays solid — same idiom
 * as macOS / status-page "live" lights, far more noticeable than a
 * plain opacity-pulsed dot.
 */
function RunningDot({ title }: { title: string }) {
  return (
    <span
      className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center"
      title={title}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
    </span>
  );
}

type Props = {
  view: View;
  activeId?: string | null;
  projectFilter: ProjectFilter;
  onSelect: (id: string) => void;
  onActiveDeleted?: () => void;
  onNewSession?: () => void;
  /** Set of session ids currently streaming; matched rows show a pulse. */
  streamingSessionIds?: ReadonlySet<string>;
};

export function SessionsPanel({
  view,
  activeId,
  projectFilter,
  onSelect,
  onActiveDeleted,
  onNewSession,
  streamingSessionIds,
}: Props) {
  const sessions = useSessions();
  const projects = useProjects() ?? [];

  const heading =
    view === 'archived'
      ? 'Archived'
      : projectFilter === 'inbox'
        ? 'Inbox'
        : projectFilter === 'all'
          ? 'All Sessions'
          : projects.find((p) => p.id === projectFilter)?.name ?? 'Sessions';
  const showProjectDot = view !== 'archived' && projectFilter === 'all';

  if (sessions === null) {
    return (
      <section className="flex h-full w-full flex-col bg-panel">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
          <h2 className="text-[15px] font-semibold text-fg">{heading}</h2>
        </header>
        <div className="px-3 py-6 text-center text-xs text-fg-subtle">Loading…</div>
      </section>
    );
  }

  const items = sessions
    .filter((s) => (view === 'archived' ? s.archived : !s.archived))
    .filter((s) => {
      // Archived view ignores the project filter — archive is a strict
      // user intent ("show me everything I archived"), filtering further
      // by project would just hide rows the user expects to see.
      if (view === 'archived') return true;
      if (projectFilter === 'all') return true;
      if (projectFilter === 'inbox') return !s.projectId;
      return s.projectId === projectFilter;
    });

  return (
    <section className="relative flex h-full w-full flex-col bg-panel">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-[15px] font-semibold text-fg">{heading}</h2>
        {view === 'all' && onNewSession && (
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
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        {/* Placeholder for an unsaved fresh chat — gives the user feedback that
            "New Session" did something, before the first message persists it. */}
        {view === 'all' && activeId == null && <NewSessionRow />}

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
                      onClick={() => onSelect(s.id)}
                      onAfterDelete={() => onActiveDeleted?.()}
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

function NewSessionRow() {
  return (
    <div className="relative">
      <span className="absolute inset-y-1.5 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      <div className="flex w-full items-center gap-3 rounded-lg bg-elevated px-3 py-2.5">
        <Circle
          className="h-4 w-4 shrink-0 text-fg-subtle"
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-[0.95rem] text-fg">New session</span>
            <span className="shrink-0 text-xs text-fg-subtle">now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function revealLabel(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'Show in Finder';
  if (ua.includes('Windows')) return 'Show in Explorer';
  return 'Show in File Manager';
}

/**
 * Bucket sessions into date groups (Today / Yesterday / Previous 7 Days /
 * Previous 30 Days / Month YYYY). Input is assumed to be sorted by
 * `lastMessageAt` descending; we preserve that within each bucket.
 *
 * `archived = true` collapses everything under a single "Archived" header
 * — the date split would just add noise on a list that's mostly cold.
 */
function groupByDate(
  items: SessionSummary[],
  archived: boolean,
): Array<[string, SessionSummary[]]> {
  if (archived) return items.length ? [['Archived', items]] : [];

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOf7Days = startOfToday - 7 * 86_400_000;
  const startOf30Days = startOfToday - 30 * 86_400_000;

  const groups = new Map<string, SessionSummary[]>();
  const push = (key: string, s: SessionSummary) => {
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  };

  // Use insertion order to keep the rendering order stable. Today comes
  // first because items are sorted desc; older months append in the order
  // we encounter them.
  for (const s of items) {
    const ts = s.lastMessageAt;
    if (ts >= startOfToday) push('Today', s);
    else if (ts >= startOfYesterday) push('Yesterday', s);
    else if (ts >= startOf7Days) push('Previous 7 Days', s);
    else if (ts >= startOf30Days) push('Previous 30 Days', s);
    else {
      const d = new Date(ts);
      // "April 2026" — a single bucket per calendar month is enough for
      // a personal sidebar; per-day for old chats clutters the list.
      const label = d.toLocaleString(undefined, {
        month: 'long',
        year: 'numeric',
      });
      push(label, s);
    }
  }
  return Array.from(groups.entries());
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString();
}
