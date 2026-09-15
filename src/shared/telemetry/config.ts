export type OtelExporterType = 'file' | 'otlp' | 'console';

export interface OtelConfig {
  enabled: boolean;
  captureContent: boolean;
  exporter: OtelExporterType;
  outfile: string;
  otlpEndpoint: string;
  serviceName: string;
  serviceVersion: string;
  resourceAttributes: Record<string, string>;
  maxFileBytes: number;
}

export const TRACER_NAME = 'minimalist-agent';
export const DEFAULT_TRACES_MAX_BYTES = 5 * 1024 * 1024;

function tracesMaxBytes(env: NodeJS.ProcessEnv): number {
  const mb = Number(env.MA_OTEL_MAX_FILE_MB);
  return Number.isFinite(mb) && mb > 0 ? Math.floor(mb * 1024 * 1024) : DEFAULT_TRACES_MAX_BYTES;
}

export function parseResourceAttributes(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    if (!key) continue;
    const rawVal = pair.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function perProcessOutfile(path: string, enabled: boolean, pid = process.pid): string {
  if (!enabled || !path) return path;
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return dot > slash ? `${path.slice(0, dot)}.${pid}${path.slice(dot)}` : `${path}.${pid}`;
}

export function readOtelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OtelConfig {
  const raw = (env.MA_OTEL_EXPORTER ?? 'file').toLowerCase();
  const exporter: OtelExporterType =
    raw === 'otlp' || raw === 'otlp-http' || raw === 'otlp-grpc'
      ? 'otlp'
      : raw === 'console'
        ? 'console'
        : 'file';
  return {
    enabled: env.MA_OTEL_ENABLED === '1' || env.MA_OTEL_ENABLED === 'true',
    captureContent: env.MA_OTEL_CAPTURE_CONTENT === '1' || env.MA_OTEL_CAPTURE_CONTENT === 'true',
    exporter,
    outfile: perProcessOutfile(env.MA_OTEL_OUTFILE ?? '', env.MA_OTEL_SUBAGENT === '1'),
    otlpEndpoint: env.MA_OTEL_OTLP_ENDPOINT ?? '',
    serviceName: env.MA_OTEL_SERVICE_NAME ?? TRACER_NAME,
    serviceVersion: env.MINIMALIST_AGENT_VERSION ?? '0.0.0',
    resourceAttributes: {
      ...parseResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES),
      ...parseResourceAttributes(env.MA_OTEL_RESOURCE_ATTRIBUTES),
    },
    maxFileBytes: tracesMaxBytes(env),
  };
}
