// Electron-free OpenTelemetry tracing bootstrap for the pi-server subprocess.
//
// Mirrors GitHub Copilot Chat's `github.copilot.chat.otel.*` feature, adapted
// to MA. Like `sub-logger.ts` this module MUST NOT import electron — it is
// bundled into `out/main/pi-server.js` which runs under ELECTRON_RUN_AS_NODE.
//
// Configuration comes entirely from `MA_OTEL_*` environment variables, set by
// the parent process (`agent/backends/pi/agent.ts`) from the persisted
// telemetry settings. When tracing is disabled (the default) every helper is a
// cheap no-op: `getTracer()` returns the API's built-in no-op tracer because no
// provider is registered, so instrumented code pays effectively nothing.
//
// Span model (see docs/OTEL.md):
//   session.turn  → model.request, tool.<name>, subagent.exec (child process)
//
// Content capture (prompt/response/tool args) is gated behind
// MA_OTEL_CAPTURE_CONTENT and defaults OFF. Secrets are never recorded.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  context,
  trace,
  SpanStatusCode,
  SpanKind,
  type Attributes,
  type Context,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { createLogger } from './sub-logger';

const log = createLogger('otel');

export type OtelExporterType = 'file' | 'otlp' | 'console';

export interface OtelConfig {
  enabled: boolean;
  captureContent: boolean;
  exporter: OtelExporterType;
  outfile: string;
  otlpEndpoint: string;
  serviceName: string;
  serviceVersion: string;
  /**
   * Extra OTel Resource attributes (e.g. `user.name`, `team.id`) merged onto
   * every span's resource. Sourced from the standard `OTEL_RESOURCE_ATTRIBUTES`
   * env var so external collectors / per-user token-telemetry pipelines can
   * attribute usage to a person.
   */
  resourceAttributes: Record<string, string>;
}

const TRACER_NAME = 'minimalist-agent';

/**
 * Parse the W3C `OTEL_RESOURCE_ATTRIBUTES` format: a comma-separated list of
 * `key=value` pairs where the value is percent-encoded (baggage-octet). Invalid
 * pairs are skipped rather than throwing.
 */
export function parseResourceAttributes(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    if (!key) continue;
    const rawVal = pair.slice(eq + 1).trim();
    let val = rawVal;
    try {
      val = decodeURIComponent(rawVal);
    } catch {
      // keep the raw value if it isn't valid percent-encoding
    }
    out[key] = val;
  }
  return out;
}

let provider: NodeTracerProvider | undefined;
let activeConfig: OtelConfig | undefined;
let initialized = false;

/** Parse `MA_OTEL_*` env into a config. `enabled` is false unless explicitly set. */
export function readOtelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OtelConfig {
  const raw = (env.MA_OTEL_EXPORTER ?? 'file').toLowerCase();
  // Accept Copilot-style aliases. gRPC isn't bundled; fall back to HTTP.
  const exporter: OtelExporterType =
    raw === 'otlp' || raw === 'otlp-http' || raw === 'otlp-grpc'
      ? 'otlp'
      : raw === 'console'
        ? 'console'
        : 'file';
  return {
    enabled: env.MA_OTEL_ENABLED === '1' || env.MA_OTEL_ENABLED === 'true',
    captureContent:
      env.MA_OTEL_CAPTURE_CONTENT === '1' || env.MA_OTEL_CAPTURE_CONTENT === 'true',
    exporter,
    outfile: env.MA_OTEL_OUTFILE ?? '',
    otlpEndpoint: env.MA_OTEL_OTLP_ENDPOINT ?? '',
    serviceName: env.MA_OTEL_SERVICE_NAME ?? TRACER_NAME,
    serviceVersion: env.MINIMALIST_AGENT_VERSION ?? '0.0.0',
    // MA_OTEL_RESOURCE_ATTRIBUTES (our settings UI) takes precedence; the
    // standard OTEL_RESOURCE_ATTRIBUTES is honored too so external pipelines
    // that set it (e.g. `user.name=alice,team.id=team-a`) just work.
    resourceAttributes: {
      ...parseResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES),
      ...parseResourceAttributes(env.MA_OTEL_RESOURCE_ATTRIBUTES),
    },
  };
}

/**
 * JSONL file exporter — appends one line of JSON per finished span. This is the
 * MA equivalent of Copilot's `file` exporter: local, tail-able, no collector.
 * SimpleSpanProcessor is used with it so lines flush as spans end (better for
 * `tail -f`); the small synchronous append is acceptable in the subprocess.
 */
class JsonlFileSpanExporter implements SpanExporter {
  private failed = false;

  constructor(private readonly file: string) {
    try {
      mkdirSync(dirname(file), { recursive: true });
    } catch (e) {
      this.failed = true;
      log.warn('could not create traces dir:', e);
    }
  }

  export(spans: ReadableSpan[], resultCallback: (r: ExportResult) => void): void {
    if (this.failed) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }
    try {
      const lines = spans.map((s) => JSON.stringify(serializeSpan(s))).join('\n') + '\n';
      appendFileSync(this.file, lines);
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (e) {
      log.warn('span export failed:', e);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

function hrToMs(t: [number, number]): number {
  return t[0] * 1e3 + t[1] / 1e6;
}

function serializeSpan(s: ReadableSpan): Record<string, unknown> {
  const ctx = s.spanContext();
  const resourceAttrs = s.resource.attributes;
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: s.parentSpanContext?.spanId,
    name: s.name,
    kind: SpanKind[s.kind],
    // hrTime ([seconds, nanos]) mirrors the OpenTelemetry-JS record shape so
    // downstream tools that read `hrTime[0]` for the event time work unchanged.
    hrTime: s.startTime,
    startTimeMs: hrToMs(s.startTime),
    endTimeMs: hrToMs(s.endTime),
    durationMs: hrToMs(s.duration),
    status: { code: SpanStatusCode[s.status.code], message: s.status.message },
    attributes: s.attributes,
    events: s.events.map((e) => ({
      name: e.name,
      timeMs: hrToMs(e.time),
      attributes: e.attributes,
    })),
    // Flat map for humans + `_rawAttributes` pair-array for OpenTelemetry-JS
    // style consumers that read resource attributes as [key, value] tuples.
    resource: {
      ...resourceAttrs,
      _rawAttributes: Object.entries(resourceAttrs).map(([k, v]) => [k, v]),
    },
  };
}

/**
 * Console exporter — writes serialized spans to stderr (never stdout, which is
 * the JSONL protocol channel). Useful for quick local debugging.
 */
class StderrSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (r: ExportResult) => void): void {
    for (const s of spans) {
      process.stderr.write(`[otel-span] ${JSON.stringify(serializeSpan(s))}\n`);
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

async function buildExporter(cfg: OtelConfig): Promise<SpanExporter | null> {
  if (cfg.exporter === 'otlp') {
    if (!cfg.otlpEndpoint) {
      log.warn('exporter=otlp but MA_OTEL_OTLP_ENDPOINT is empty; tracing disabled');
      return null;
    }
    // Dynamic import keeps the OTLP HTTP stack out of the load path when the
    // file exporter (the default) is used.
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    return new OTLPTraceExporter({ url: cfg.otlpEndpoint });
  }
  if (cfg.exporter === 'console') return new StderrSpanExporter();
  if (!cfg.outfile) {
    log.warn('exporter=file but MA_OTEL_OUTFILE is empty; tracing disabled');
    return null;
  }
  return new JsonlFileSpanExporter(cfg.outfile);
}

/**
 * Initialize tracing from `MA_OTEL_*` env. Idempotent and safe to call when
 * disabled (returns false, registers nothing). Async because the OTLP exporter
 * is dynamically imported.
 */
export async function initOtel(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (initialized) return !!provider;
  initialized = true;

  const cfg = readOtelConfigFromEnv(env);
  activeConfig = cfg;
  if (!cfg.enabled) return false;

  const exporter = await buildExporter(cfg);
  if (!exporter) return false;

  // File/console flush per-span for tailing; OTLP batches to amortize HTTP.
  const processor =
    cfg.exporter === 'otlp'
      ? new BatchSpanProcessor(exporter)
      : new SimpleSpanProcessor(exporter);

  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: cfg.serviceName,
      [ATTR_SERVICE_VERSION]: cfg.serviceVersion,
      ...cfg.resourceAttributes,
    }),
    spanProcessors: [processor],
  });
  provider.register();

  log.info(
    `tracing enabled (exporter=${cfg.exporter}, captureContent=${cfg.captureContent})`,
  );
  return true;
}

export function isOtelEnabled(): boolean {
  return !!provider;
}

/** Whether prompt/response/tool-argument content may be attached to spans. */
export function captureContent(): boolean {
  return !!activeConfig?.captureContent && isOtelEnabled();
}

export function getTracer(): Tracer {
  // With no provider registered this returns the API's no-op tracer.
  return trace.getTracer(TRACER_NAME);
}

export interface SpanOptions {
  attributes?: Attributes;
  kind?: SpanKind;
  /** Run the span under an explicit parent context instead of the active one. */
  parentContext?: Context;
}

/**
 * Run `fn` inside a new span made active for the duration. Child spans started
 * within `fn` (including across awaited tool callbacks, thanks to the async
 * context manager) nest automatically. The span's status is set to error and
 * the exception recorded if `fn` throws; the error is rethrown unchanged so
 * control flow (e.g. permission-block throws) is preserved.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  opts: SpanOptions = {},
): Promise<T> {
  const tracer = getTracer();
  const parent = opts.parentContext ?? context.active();
  const span = tracer.startSpan(
    name,
    { kind: opts.kind ?? SpanKind.INTERNAL, attributes: opts.attributes },
    parent,
  );
  const ctx = trace.setSpan(parent, span);
  try {
    const result = await context.with(ctx, () => fn(span));
    return result;
  } catch (err) {
    recordException(span, err);
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Start a long-lived span the caller is responsible for ending. Used for the
 * turn span (which spans many event callbacks) and the model.request span
 * (opened on message_start, closed on message_end). Returns the span plus the
 * context that has it active, so callers can run work under it.
 */
export function startSpan(
  name: string,
  opts: SpanOptions = {},
): { span: Span; context: Context } {
  const tracer = getTracer();
  const parent = opts.parentContext ?? context.active();
  const span = tracer.startSpan(
    name,
    { kind: opts.kind ?? SpanKind.INTERNAL, attributes: opts.attributes },
    parent,
  );
  return { span, context: trace.setSpan(parent, span) };
}

export function recordException(span: Span, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error) span.recordException(err);
  else span.recordException({ message });
  span.setStatus({ code: SpanStatusCode.ERROR, message });
}

/**
 * Set multiple attributes, skipping `undefined`/`null`/empty-string so optional
 * GenAI fields (`gen_ai.response.id`, cache tokens, …) only appear when known.
 */
export function setAttrs(span: Span, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === '') continue;
    span.setAttribute(k, v as never);
  }
}

/** Safe JSON for attribute values — truncates and never throws. */
export function safeAttr(value: unknown, max = 4000): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s.length > max) s = s.slice(0, max) + `…(+${s.length - max} chars)`;
  return s;
}

/** Flush and tear down the tracer. Call on subprocess shutdown. */
export async function shutdownOtel(): Promise<void> {
  if (!provider) return;
  try {
    await provider.forceFlush();
    await provider.shutdown();
  } catch (e) {
    log.warn('otel shutdown error:', e);
  } finally {
    provider = undefined;
  }
}

export { SpanKind, SpanStatusCode };
export type { Span };
