import {
  Cog,
  Keyboard,
  Sparkles,
  Folders,
  Shield,
  SquareTerminal,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const SETTINGS_CATEGORIES = [
  { id: 'app',         label: 'App',         hint: 'Notifications and updates',     icon: Cog },
  { id: 'ai',          label: 'AI',          hint: 'Model, thinking, connections',  icon: Sparkles },
  { id: 'projects',    label: 'Projects',    hint: 'Group sessions by project',     icon: Folders },
  { id: 'permissions', label: 'Permissions', hint: 'Explore mode rules',            icon: Shield },
  { id: 'preferences', label: 'Preferences', hint: 'Name, timezone, language, notes',  icon: User },
  { id: 'terminal',    label: 'Terminal',    hint: 'Shell, font, scrollback',           icon: SquareTerminal },
  { id: 'shortcuts',    label: 'Shortcuts',   hint: 'Keyboard shortcut reference',       icon: Keyboard },
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number]['id'];

type Props = {
  active: SettingsCategory;
  onChange: (c: SettingsCategory) => void;
};

export function SettingsCategoriesPanel({ active, onChange }: Props) {
  return (
    <section className="flex h-full w-full flex-col bg-panel">
      <div className="flex h-10 items-center justify-center px-3">
        <h2 className="text-[15px] font-semibold text-fg">Settings</h2>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          {SETTINGS_CATEGORIES.map(({ id, label, hint, icon: Icon }) => {
            const isActive = id === active;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={cn(
                  'flex items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-elevated-2 ring-1 ring-border-strong'
                    : 'hover:bg-elevated/70',
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    isActive ? 'text-fg' : 'text-fg-muted',
                  )}
                  strokeWidth={1.75}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{label}</div>
                  <div className="truncate text-xs text-fg-subtle">{hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
