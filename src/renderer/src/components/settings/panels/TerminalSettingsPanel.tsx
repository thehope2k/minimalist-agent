import { useState } from 'react';
import { Select, Button } from '@/components/ui';
import { SettingsCard, SettingsSection, SettingsRow } from '../SettingsPrimitives';
import {
  getTerminalSettings,
  saveTerminalSettings,
  type TerminalSettings,
} from '@/lib/terminal-settings';

// First 3 are bundled with the app — always available on any system.
// Last 3 are guaranteed system fonts on macOS.
const FONT_OPTIONS = [
  { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
  { value: '"Fira Code", monospace',      label: 'Fira Code' },
  { value: '"Cascadia Code", monospace',  label: 'Cascadia Code' },
  { value: 'Menlo, Monaco, monospace',    label: 'Menlo' },
  { value: 'Monaco, monospace',           label: 'Monaco' },
  { value: '"Courier New", monospace',    label: 'Courier New' },
];

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((n) => ({
  value: String(n),
  label: `${n}px`,
}));

const SCROLLBACK_OPTIONS = [
  { value: '100',   label: '100 lines' },
  { value: '500',   label: '500 lines' },
  { value: '1000',  label: '1,000 lines (default)' },
  { value: '2000',  label: '2,000 lines' },
  { value: '5000',  label: '5,000 lines' },
  { value: '10000', label: '10,000 lines' },
];

export function TerminalSettingsPanel() {
  const [settings, setSettings] = useState<TerminalSettings>(getTerminalSettings);

  const update = (patch: Partial<TerminalSettings>) =>
    setSettings(saveTerminalSettings(patch));

  const handlePickShell = async () => {
    const path = await window.api.fs.pickFile({
      title: 'Select shell executable',
      defaultPath: '/bin',
    });
    if (path) update({ shell: path });
  };

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <p className="mb-8 text-sm text-fg-muted">
        Changes apply to new terminal tabs. Existing tabs keep their current settings.
      </p>

      <SettingsSection title="Shell">
        <SettingsCard>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">Shell</div>
              <div className="mt-0.5 truncate font-mono text-xs text-fg-subtle">
                {settings.shell || 'Auto-detect (system default)'}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {settings.shell && (
                <Button variant="ghost" onClick={() => update({ shell: '' })}>
                  Reset
                </Button>
              )}
              <Button variant="outline" onClick={handlePickShell}>
                Browse…
              </Button>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Font">
        <SettingsCard>
          <SettingsRow
            label="Font family"
            description="JetBrains Mono, Fira Code, and Cascadia Code are bundled with the app."
            control={
              <Select
                value={settings.fontFamily}
                onChange={(v) => update({ fontFamily: v })}
                options={FONT_OPTIONS}
                variant="compact"
                menuWidth={220}
              />
            }
          />
          <div className="h-px bg-border/50" />
          <SettingsRow
            label="Font size"
            control={
              <Select
                value={String(settings.fontSize)}
                onChange={(v) => update({ fontSize: parseInt(v, 10) })}
                options={FONT_SIZE_OPTIONS}
                variant="compact"
                menuWidth={140}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Scrollback">
        <SettingsCard>
          <SettingsRow
            label="Scrollback lines"
            description="Lines of output kept above the visible area. 1,000 covers most workflows."
            control={
              <Select
                value={String(settings.scrollback)}
                onChange={(v) => update({ scrollback: parseInt(v, 10) })}
                options={SCROLLBACK_OPTIONS}
                variant="compact"
                menuWidth={200}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
