import { Badge } from '@/components/ui';
import { SettingsCard, SettingsSection } from '../SettingsPrimitives';
import { SHORTCUT_GROUPS, resolveKeys } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

export function KeyboardShortcutsPanel() {
  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <p className="mb-8 text-sm text-fg-muted">
        All keyboard shortcuts available in the app. Shortcut rebinding is not
        yet supported — more shortcuts will appear here as features ship.
      </p>

      {SHORTCUT_GROUPS.map((group) => (
        <SettingsSection key={group.title} title={group.title}>
          <SettingsCard>
            {group.shortcuts.map((shortcut, i) => {
              const keys = resolveKeys(shortcut);
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-center justify-between gap-6 px-4 py-3',
                    i > 0 && 'border-t border-border/50',
                    shortcut.soon && 'opacity-55',
                  )}
                >
                  {/* Description */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-fg">
                      <span>{shortcut.label}</span>
                      {shortcut.soon && <Badge variant="soon">Soon</Badge>}
                    </div>
                    {shortcut.condition && (
                      <div className="mt-0.5 text-xs text-fg-subtle">
                        {shortcut.condition}
                      </div>
                    )}
                  </div>

                  {/* Key chips */}
                  <KeyChips keys={keys} />
                </div>
              );
            })}
          </SettingsCard>
        </SettingsSection>
      ))}
    </div>
  );
}

function KeyChips({ keys }: { keys: string[] }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {keys.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-elevated/60 px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg-muted shadow-sm"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}
