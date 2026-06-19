// Renderer-side client for telemetry (OpenTelemetry tracing) settings.
//
// Unlike most renderer settings these are persisted MAIN-side (the pi-server
// subprocess needs them at spawn via MA_OTEL_* env and can't read
// localStorage), so this module is a thin async wrapper over window.api.telemetry
// rather than a localStorage store. See docs/OTEL.md.

import type { TelemetrySettings, OtelExporterType } from './electron.d';

export type { TelemetrySettings, OtelExporterType };

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

export function getTelemetrySettings(): Promise<TelemetrySettings> {
  return window.api.telemetry.get();
}

export function saveTelemetrySettings(settings: TelemetrySettings): Promise<void> {
  return window.api.telemetry.save(settings);
}

export function getTracesPath(): Promise<string> {
  return window.api.telemetry.tracesPath();
}

export function revealTracesFile(): Promise<void> {
  return window.api.telemetry.reveal();
}
