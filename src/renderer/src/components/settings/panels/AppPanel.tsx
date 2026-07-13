import { useEffect, useState } from 'react';
import { Button, Select } from '@/components/ui';
import {
  getAppSettings,
  setNotificationsEnabled,
} from '@/lib/app-settings';
import { setSessionRetentionDays } from '@/lib/connections';
import { useAiData } from '@/hooks/useAiData';
import {
  SettingsCard,
  SettingsDivider,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '../SettingsPrimitives';

const RETENTION_OPTIONS = [
  { value: '7',   label: '7 days',   description: 'One week' },
  { value: '30',  label: '30 days',  description: 'One month' },
  { value: '60',  label: '60 days',  description: 'Two months' },
  { value: '90',  label: '90 days',  description: 'Three months' },
  { value: '180', label: '180 days', description: 'Six months' },
  { value: '365', label: '1 year',   description: 'Twelve months' },
  { value: '730', label: '2 years',  description: 'Twenty-four months' },
] as const;

type RetentionValue = (typeof RETENTION_OPTIONS)[number]['value'];

const FALLBACK_RETENTION: RetentionValue = '90';

export function AppPanel() {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  const settings = getAppSettings();
  const aiData = useAiData();

  const savedDays = aiData?.settings.sessionRetentionDays;
  const autoCleanEnabled = savedDays !== null && savedDays !== undefined;

  const toRetentionValue = (days: number | null | undefined): RetentionValue =>
    RETENTION_OPTIONS.find((o) => o.value === String(days))?.value ?? FALLBACK_RETENTION;

  const [lastRetention, setLastRetention] = useState<RetentionValue>(
    toRetentionValue(savedDays),
  );

  useEffect(() => {
    if (typeof savedDays === 'number') setLastRetention(toRetentionValue(savedDays));
  }, [savedDays]);

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
      <SettingsSection title="Storage">
        <SettingsCard>
          <SettingsToggle
            label="Auto-clean archived sessions"
            description="Automatically delete archived sessions after a set period. Also removes sessions that were opened but never used."
            checked={autoCleanEnabled}
            onCheckedChange={(v) => {
              void setSessionRetentionDays(v ? Number(lastRetention) : null);
            }}
          />
          <SettingsDivider />
          <SettingsRow
            label="Retention period"
            description="Archived sessions older than this are deleted on startup."
            control={
              <Select<RetentionValue>
                variant="compact"
                disabled={!autoCleanEnabled}
                value={lastRetention}
                onChange={(v) => void setSessionRetentionDays(Number(v))}
                options={[...RETENTION_OPTIONS]}
                menuWidth={200}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

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
