import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Check,
  ChevronDown,
  Folders,
  Inbox,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/useProjects';
import type { ProjectFilter } from './types';

interface ProjectSwitcherProps {
  value: ProjectFilter;
  onChange: (f: ProjectFilter) => void;
  onManage: () => void;
}

export function ProjectSwitcher({ value, onChange, onManage }: ProjectSwitcherProps) {
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
