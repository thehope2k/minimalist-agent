import { useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import {
  DEFAULT_TELEMETRY,
  getTelemetrySettings,
  getTracesPath,
  revealTracesFile,
  saveTelemetrySettings,
  type TelemetrySettings,
} from '@/lib/telemetry-settings';
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '../SettingsPrimitives';

/**
 * OpenTelemetry tracing settings — emits spans for agent turns, model
 * requests, and tool calls. Mirrors GitHub Copilot Chat's otel.* options.
 * See docs/OTEL.md.
 */
export function TelemetryPanel() {
  const [settings, setSettings] = useState<TelemetrySettings>(DEFAULT_TELEMETRY);
  const [tracesPath, setTracesPath] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void getTelemetrySettings().then((s) => {
      if (alive) {
        setSettings(s);
        setLoaded(true);
      }
    });
    void getTracesPath().then((p) => alive && setTracesPath(p));
    return () => {
      alive = false;
    };
  }, []);

  // Persist on every change; refresh the resolved traces path (it depends on
  // the outfile override).
  const update = (patch: Partial<TelemetrySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveTelemetrySettings(next).then(() =>
      getTracesPath().then(setTracesPath),
    );
  };

  if (!loaded) {
    return <div className="mx-auto max-w-190 px-8 py-10 text-sm text-fg-subtle">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <SettingsSection
        title="OpenTelemetry"
        subtitle="Emit structured traces (agent turns, model requests, tool calls) for observability. Off by default; changes apply to chats started afterward."
      >
        <SettingsCard>
          <SettingsToggle
            label="Enable tracing"
            description="Record spans while the agent runs. No network egress unless you pick the OTLP exporter."
            checked={settings.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Exporter">
        <SettingsCard>
          <SettingsRow
            label="Destination"
            description="Where finished spans are written."
            control={
              <Select<TelemetrySettings['exporter']>
                value={settings.exporter}
                onChange={(v) => update({ exporter: v })}
                disabled={!settings.enabled}
                options={[
                  { value: 'file', label: 'File (JSONL)' },
                  { value: 'otlp', label: 'OTLP / HTTP' },
                  { value: 'console', label: 'Console (stderr)' },
                ]}
                menuWidth={200}
              />
            }
          />
        </SettingsCard>

        {settings.exporter === 'file' && (
          <div className="mt-3">
            <SettingsCard>
              <div className="px-4 py-3">
                <Field
                  label="Output file"
                  hint={`Leave empty to use the default: ${tracesPath}`}
                >
                  <Input
                    mono
                    placeholder={tracesPath}
                    value={settings.outfile}
                    disabled={!settings.enabled}
                    onChange={(e) => update({ outfile: e.target.value })}
                  />
                </Field>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revealTracesFile()}
                  >
                    Reveal traces file
                  </Button>
                </div>
              </div>
            </SettingsCard>
          </div>
        )}

        {settings.exporter === 'otlp' && (
          <div className="mt-3">
            <SettingsCard>
              <div className="px-4 py-3">
                <Field
                  label="OTLP endpoint"
                  hint="HTTP endpoint of an OpenTelemetry collector, e.g. http://localhost:4318/v1/traces"
                >
                  <Input
                    mono
                    placeholder="http://localhost:4318/v1/traces"
                    value={settings.otlpEndpoint}
                    disabled={!settings.enabled}
                    onChange={(e) => update({ otlpEndpoint: e.target.value })}
                  />
                </Field>
              </div>
            </SettingsCard>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Identity"
        subtitle="Attributes attached to every span's resource so a shared usage dashboard can attribute token usage to you. Optional; metadata only."
      >
        <SettingsCard>
          <div className="px-4 py-3">
            <Field
              label="Display name"
              hint="Emitted as the user.name resource attribute, e.g. alice. Use the same value on every device so your totals merge."
            >
              <Input
                placeholder="alice"
                value={settings.userName}
                disabled={!settings.enabled}
                onChange={(e) => update({ userName: e.target.value })}
              />
            </Field>
            <div className="mt-3">
              <Field label="Team id" hint="Emitted as the team.id resource attribute, e.g. team-a.">
                <Input
                  placeholder="team-a"
                  value={settings.teamId}
                  disabled={!settings.enabled}
                  onChange={(e) => update({ teamId: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field
                label="Extra resource attributes"
                hint="Advanced. OTEL_RESOURCE_ATTRIBUTES form: key=value,key=value. Merged after the fields above. The standard OTEL_RESOURCE_ATTRIBUTES env var is also honored."
              >
                <Input
                  mono
                  placeholder="deployment.environment=prod,cost.center=eng-42"
                  value={settings.resourceAttributes}
                  disabled={!settings.enabled}
                  onChange={(e) => update({ resourceAttributes: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Privacy">
        <SettingsCard>
          <SettingsToggle
            label="Capture content"
            description="Attach prompt, response, and tool-argument text to spans. Off keeps traces to metadata only (timings, token counts, tool names). Secrets are never recorded."
            checked={settings.captureContent}
            onCheckedChange={(v) => update({ captureContent: v })}
            disabled={!settings.enabled}
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
