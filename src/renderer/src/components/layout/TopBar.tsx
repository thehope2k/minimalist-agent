import {
  Archive,
  Check,
  ChevronDown,
  Folders,
  HelpCircle,
  Inbox,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
  Sparkles,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import {useEffect, useState} from 'react';
import {IconButton} from '../ui';
import {cn} from '@/lib/utils';
import {useProjects} from '@/hooks/useProjects';
import {hasUnseenChangelog, markChangelogSeen} from '@/lib/changelog';
import {WhatsNewDialog} from './WhatsNewDialog';

export type View = 'all' | 'archived' | 'skills' | 'extensions' | 'settings';

/** "all" = no project filter; "inbox" = sessions with projectId === null; otherwise a project id. */
export type ProjectFilter = 'all' | 'inbox' | string;

type NavTabProps = {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
};

function NavTab({ icon: Icon, label, active, onClick }: NavTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'titlebar-no-drag relative flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all duration-150',
        active
          ? 'bg-accent/15 text-accent'
          : 'text-fg-muted hover:bg-elevated hover:text-fg',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 transition-transform',
          active && 'scale-105',
        )}
        strokeWidth={active ? 2 : 1.75}
      />
      <span>{label}</span>
    </button>
  );
}

type Props = {
  view: View;
  onViewChange: (v: View) => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  projectFilter: ProjectFilter;
  onProjectFilterChange: (f: ProjectFilter) => void;
  onManageProjects: () => void;
};

export function TopBar({
  view,
  onViewChange,
  onToggleSidebar,
  sidebarCollapsed,
  projectFilter,
  onProjectFilterChange,
  onManageProjects,
}: Props) {
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

      <div className="titlebar-no-drag ml-3 flex h-9 items-center gap-0.5 rounded-lg border border-border bg-elevated/40 p-0.5">
        <NavTab
          icon={Inbox}
          label="Sessions"
          active={view === 'all'}
          onClick={() => onViewChange('all')}
        />
        <NavTab
          icon={Sparkles}
          label="Skills"
          active={view === 'skills'}
          onClick={() => onViewChange('skills')}
        />
        <NavTab
          icon={Plug}
          label="Extensions"
          active={view === 'extensions'}
          onClick={() => onViewChange('extensions')}
        />
        <NavTab
          icon={Archive}
          label="Archived"
          active={view === 'archived'}
          onClick={() => onViewChange('archived')}
        />
        <NavTab
          icon={Settings}
          label="Settings"
          active={view === 'settings'}
          onClick={() => onViewChange('settings')}
        />
      </div>

      <div className="flex-1" />

      <div className="titlebar-no-drag flex items-center gap-0.5">
        <WhatsNewButton />
        <IconButton icon={HelpCircle} label="Help" />
      </div>
    </div>
  );
}

function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    setUnseen(hasUnseenChangelog());
  }, []);

  const handleOpen = () => {
    setOpen(true);
    markChangelogSeen();
    setUnseen(false);
  };

  return (
    <>
      <div className="relative">
        <IconButton icon={Megaphone} label="What's new" onClick={handleOpen} />
        {unseen && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-app"
          />
        )}
      </div>
      {open && <WhatsNewDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ProjectSwitcher({
  value,
  onChange,
  onManage,
}: {
  value: ProjectFilter;
  onChange: (f: ProjectFilter) => void;
  onManage: () => void;
}) {
  const projects = useProjects();
  const [open, setOpen] = useState(false);

  const selectedProject =
    value !== 'all' && value !== 'inbox'
      ? projects?.find((p) => p.id === value)
      : null;
  const label =
    value === 'all'
      ? 'All Sessions'
      : value === 'inbox'
        ? 'Inbox'
        : selectedProject?.name ?? 'Project';
  const dot = selectedProject?.color;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'titlebar-no-drag flex h-8 items-center gap-2 rounded-md border border-border-strong bg-elevated/60 px-2.5 text-sm font-medium text-fg transition-colors',
            'hover:bg-elevated-2',
            open && 'bg-elevated-2',
          )}
        >
          {value === 'all' ? (
            <Folders className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          ) : value === 'inbox' ? (
            <Inbox className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          ) : (
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-black/30"
              style={{ backgroundColor: dot ?? 'var(--color-accent)' }}
            />
          )}
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-fg-subtle transition-transform',
              open && 'rotate-180',
            )}
            strokeWidth={2}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 w-56 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
        >
          <ProjectSwitcherItem
            label="All Sessions"
            icon={Folders}
            selected={value === 'all'}
            onSelect={() => {
              onChange('all');
              setOpen(false);
            }}
          />
          <ProjectSwitcherItem
            label="Inbox"
            icon={Inbox}
            selected={value === 'inbox'}
            onSelect={() => {
              onChange('inbox');
              setOpen(false);
            }}
          />
          {projects && projects.length > 0 && (
            <div className="my-1 h-px bg-border" />
          )}
          {projects?.map((p) => (
            <ProjectSwitcherItem
              key={p.id}
              label={p.name}
              dotColor={p.color}
              selected={value === p.id}
              onSelect={() => {
                onChange(p.id);
                setOpen(false);
              }}
            />
          ))}
          <div className="my-1 h-px bg-border" />
          <ProjectSwitcherItem
            label="Manage projects…"
            icon={Settings}
            onSelect={() => {
              setOpen(false);
              onManage();
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ProjectSwitcherItem({
  label,
  icon: Icon,
  dotColor,
  selected,
  onSelect,
}: {
  label: string;
  icon?: React.ElementType;
  dotColor?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        'text-fg hover:bg-elevated',
      )}
    >
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      ) : (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor ?? 'var(--color-accent)' }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {selected && (
        <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
      )}
    </button>
  );
}
