import {
  Archive,
  Bot,
  Inbox,
  Plug,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View, NavTabProps } from './types';

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
        className={cn('h-4 w-4 transition-transform', active && 'scale-105')}
        strokeWidth={active ? 2 : 1.75}
      />
      <span>{label}</span>
    </button>
  );
}

interface ViewTabsProps {
  view: View;
  onViewChange: (v: View) => void;
}

export function ViewTabs({ view, onViewChange }: ViewTabsProps) {
  return (
    <div className="titlebar-no-drag ml-3 flex h-9 items-center gap-0.5 rounded-lg border border-border bg-elevated/40 p-0.5">
      <NavTab
        icon={Inbox}
        label="Sessions"
        active={view === 'all'}
        onClick={() => onViewChange('all')}
      />
      <NavTab
        icon={Bot}
        label="Agents"
        active={view === 'agents'}
        onClick={() => onViewChange('agents')}
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
  );
}
