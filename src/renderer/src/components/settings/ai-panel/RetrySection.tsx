import { MAX_RETRY_ATTEMPTS, resolveRetrySettings, setRetrySettings } from '@/lib/connections';
import type { AiSettings } from '@/lib/electron';
import { Input } from '@/components/ui';
import { SettingsCard, SettingsDivider, SettingsRow, SettingsToggle } from '../SettingsPrimitives';

export function RetrySection({ settings }: { settings: AiSettings }) {
  const { enabled, maxRetries } = resolveRetrySettings(settings.retrySettings);

  return (
    <SettingsCard>
      <SettingsToggle
        label="Auto-retry"
        description="Retry a turn automatically after a transient provider error such as an overloaded or unavailable service."
        checked={enabled}
        onCheckedChange={(v) => void setRetrySettings({ enabled: v })}
      />
      <SettingsDivider />
      <SettingsRow
        label="Maximum attempts"
        description="Retries per turn before the error is shown. Applies to new and restarted sessions."
        control={
          <Input
            aria-label="Maximum retry attempts"
            type="number"
            disabled={!enabled}
            min={0}
            max={MAX_RETRY_ATTEMPTS}
            value={maxRetries}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (Number.isFinite(value)) void setRetrySettings({ maxRetries: value });
            }}
            className="w-16 text-right"
          />
        }
      />
    </SettingsCard>
  );
}
