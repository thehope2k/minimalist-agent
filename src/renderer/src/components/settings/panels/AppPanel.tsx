import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import {
  getAppSettings,
  setNotificationsEnabled,
} from '@/lib/app-settings';
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '../SettingsPrimitives';

export function AppPanel() {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  const settings = getAppSettings();

  // Keep-awake state lives in main; mirror it here for UI.
  const [keepAwake, setKeepAwakeState] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.api.app.getVersion().then((v) => alive && setVersion(v));
    void window.api.app.getKeepAwake().then((v) => alive && setKeepAwakeState(v));
    return () => {
      alive = false;
    };
  }, []);

  const handleKeepAwake = async (enabled: boolean) => {
    const next = await window.api.app.setKeepAwake(enabled);
    setKeepAwakeState(next);
  };

  const handleCheckUpdates = async () => {
    setChecking(true);
    await window.api.update.check();
    setChecking(false);
  };

  const [copied, setCopied] = useState(false);
  const handleRevealLogs = () => {
    void window.api.logs.reveal();
  };
  const handleCopyLogs = async () => {
    const text = await window.api.logs.read();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <SettingsSection title="Notifications">
        <SettingsCard>
          <SettingsToggle
            label="Desktop Notifications"
            description="Show system notifications when long-running tasks finish."
            checked={settings.notificationsEnabled}
            onCheckedChange={(v) => {
              setNotificationsEnabled(v);
              refresh();
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Power">
        <SettingsCard>
          <SettingsToggle
            label="Keep Screen Awake"
            description="Prevent display sleep while the agent is running."
            checked={keepAwake}
            onCheckedChange={handleKeepAwake}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsCard>
          <SettingsRow
            label="Version"
            control={
              <span className="text-sm text-fg-subtle">{version ?? 'Loading…'}</span>
            }
          />
          <SettingsRow
            label="Check for Updates"
            control={
              <Button
                variant="outline"
                onClick={handleCheckUpdates}
                loading={checking}
              >
                {checking ? 'Checking…' : 'Check Now'}
              </Button>
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Logs">
        <SettingsCard>
          <SettingsRow
            label="Application Logs"
            description="Reveal or copy the on-disk log file to attach to a bug report."
            control={
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopyLogs}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button variant="outline" onClick={handleRevealLogs}>
                  Reveal
                </Button>
              </div>
            }
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
