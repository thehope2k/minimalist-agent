import { useEffect, useState } from 'react';
import { Select } from '@/components/ui';
import { SettingsCard, SettingsSection, SettingsRow } from '../SettingsPrimitives';
import {
  getTerminalSettings,
  saveTerminalSettings,
  type TerminalSettings,
} from '@/lib/terminal-settings';

const AUTO_DETECT_SHELL = '';

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
  const [shellOptions, setShellOptions] = useState<{ value: string; label: string }[]>([
    { value: AUTO_DETECT_SHELL, label: 'Auto-detect (system default)' },
  ]);

  useEffect(() => {
    void window.api.terminal.listShells().then((shells) => {
      setShellOptions([
        { value: AUTO_DETECT_SHELL, label: 'Auto-detect (system default)' },
        ...shells.map((path) => ({ value: path, label: path })),
      ]);
      const current = getTerminalSettings().shell;
      if (current && !shells.includes(current)) {
        update({ shell: AUTO_DETECT_SHELL });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<TerminalSettings>) =>
    setSettings(saveTerminalSettings(patch));

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <p className="mb-8 text-sm text-fg-muted">
        Changes apply to new terminal tabs. Existing tabs keep their current settings.
      </p>

      <SettingsSection title="Shell">
        <SettingsCard>
          <SettingsRow
            label="Shell"
            description="Only login shells registered on this system can be selected."
            control={
              <Select
                value={settings.shell}
                onChange={(v) => update({ shell: v })}
                options={shellOptions}
                variant="compact"
                menuWidth={260}
              />
            }
          />
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
