// Telemetry (OpenTelemetry tracing) settings — persisted main-side because the
// pi-server subprocess can't read renderer localStorage and needs the config
// at spawn time (passed via MA_OTEL_* env). See docs/OTEL.md.
//
// Mirrors GitHub Copilot Chat's `github.copilot.chat.otel.*`:
//   enabled / captureContent / exporterType / outfile (+ otlpEndpoint for OTLP).

import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';

export type OtelExporterType = 'file' | 'otlp' | 'console';

export interface TelemetrySettings {
  /** Master switch. Off by default — tracing adds nothing unless enabled. */
  enabled: boolean;
  /** Attach prompt/response/tool-argument text to spans. Off by default. */
  captureContent: boolean;
  /** Where finished spans go. */
  exporter: OtelExporterType;
  /** Override path for the `file` exporter. Empty → default traces.jsonl. */
  outfile: string;
  /** OTLP/HTTP endpoint, used only when exporter === 'otlp'. */
  otlpEndpoint: string;
  /**
   * Display name attributed to your token usage in shared dashboards, e.g.
   * `alice`. Emitted as the `user.name` resource attribute. Empty → omitted.
   */
  userName: string;
  /** Team/cohort id, emitted as the `team.id` resource attribute. Empty → omitted. */
  teamId: string;
  /**
   * Advanced: extra resource attributes in `OTEL_RESOURCE_ATTRIBUTES` form
   * (`k1=v1,k2=v2`). Merged after userName/teamId. Empty → omitted.
   */
  resourceAttributes: string;
}

export const DEFAULT_TELEMETRY: TelemetrySettings = {
  enabled: false,
  captureContent: false,
  exporter: 'file',
  outfile: '',
  otlpEndpoint: '',
  userName: '',
  teamId: '',
  resourceAttributes: '',
};

const SCHEMA: FileSchema<TelemetrySettings> = {
  path: Paths.telemetry(),
  currentVersion: 2,
  defaultValue: DEFAULT_TELEMETRY,
  migrations: [
    // v0 → v1: initial version.
    (prev) => ({ ...DEFAULT_TELEMETRY, ...(prev as Partial<TelemetrySettings>) }),
    // v1 → v2: add resource-attribute identity fields (userName/teamId/extra).
    (prev) => ({ ...DEFAULT_TELEMETRY, ...(prev as Partial<TelemetrySettings>) }),
  ],
};

export function getTelemetrySettings(): TelemetrySettings {
  return { ...DEFAULT_TELEMETRY, ...load(SCHEMA) };
}

export function saveTelemetrySettings(settings: TelemetrySettings): void {
  save(SCHEMA, settings);
}

/** Resolve the effective file path used by the `file` exporter. */
export function resolveTracesFile(settings: TelemetrySettings = getTelemetrySettings()): string {
  return settings.outfile?.trim() || Paths.tracesFile();
}

/**
 * Build the `MA_OTEL_*` environment passed to the pi-server subprocess at
 * spawn. Returns an empty object when tracing is disabled so spawning stays
 * untouched in the common case.
 */
export function telemetryEnv(): Record<string, string> {
  const s = getTelemetrySettings();
  if (!s.enabled) return {};
  const env: Record<string, string> = {
    MA_OTEL_ENABLED: '1',
    MA_OTEL_CAPTURE_CONTENT: s.captureContent ? '1' : '0',
    MA_OTEL_EXPORTER: s.exporter,
    MA_OTEL_OUTFILE: resolveTracesFile(s),
    MA_OTEL_OTLP_ENDPOINT: s.otlpEndpoint ?? '',
  };
  const attrs = buildResourceAttributes(s);
  if (attrs) env.MA_OTEL_RESOURCE_ATTRIBUTES = attrs;
  return env;
}

/**
 * Compose the `OTEL_RESOURCE_ATTRIBUTES` string from the identity fields. Values
 * are percent-encoded per the W3C baggage-octet rule so names with commas/`=`
 * survive. Returns '' when nothing is set.
 */
export function buildResourceAttributes(s: TelemetrySettings): string {
  const pairs: string[] = [];
  const enc = (v: string) => encodeURIComponent(v.trim());
  if (s.userName?.trim()) pairs.push(`user.name=${enc(s.userName)}`);
  if (s.teamId?.trim()) pairs.push(`team.id=${enc(s.teamId)}`);
  const extra = s.resourceAttributes?.trim();
  if (extra) pairs.push(extra);
  return pairs.join(',');
}
