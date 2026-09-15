// Electron-free OpenTelemetry tracing bootstrap for the pi-server subprocess.
import {
  context,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Context,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { createLogger } from './sub-logger';
import {
  readOtelConfigFromEnv,
  parseResourceAttributes,
  perProcessOutfile,
  TRACER_NAME,
  type OtelConfig,
} from './telemetry/config';
import { JsonlFileSpanExporter, StderrSpanExporter } from './telemetry/exporters';

const log = createLogger('otel');

export type { OtelConfig, OtelExporterType } from './telemetry/config';
export {
  parseResourceAttributes,
  perProcessOutfile,
  readOtelConfigFromEnv,
} from './telemetry/config';

let provider: NodeTracerProvider | undefined;
let activeConfig: OtelConfig | undefined;
let initialized = false;

async function buildExporter(cfg: OtelConfig): Promise<SpanExporter | null> {
  if (cfg.exporter === 'otlp') {
    if (!cfg.otlpEndpoint) {
      log.warn('exporter=otlp but MA_OTEL_OTLP_ENDPOINT is empty; tracing disabled');
      return null;
    }
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    return new OTLPTraceExporter({ url: cfg.otlpEndpoint });
  }
  if (cfg.exporter === 'console') return new StderrSpanExporter();
  if (!cfg.outfile) {
    log.warn('exporter=file but MA_OTEL_OUTFILE is empty; tracing disabled');
    return null;
  }
  return new JsonlFileSpanExporter(cfg.outfile, log, cfg.maxFileBytes);
}

export async function initOtel(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (initialized) return !!provider;
  initialized = true;
  const cfg = readOtelConfigFromEnv(env);
  activeConfig = cfg;
  if (!cfg.enabled) return false;

  let exporter: SpanExporter | null;
  try {
    exporter = await buildExporter(cfg);
  } catch (error) {
    log.warn('exporter init failed; tracing disabled:', error);
    initialized = false;
    return false;
  }
  if (!exporter) return false;

  const processor =
    cfg.exporter === 'otlp' ? new BatchSpanProcessor(exporter) : new SimpleSpanProcessor(exporter);
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      ...cfg.resourceAttributes,
      [ATTR_SERVICE_NAME]: cfg.serviceName,
      [ATTR_SERVICE_VERSION]: cfg.serviceVersion,
    }),
    spanProcessors: [processor],
  });
  provider.register();
  log.info(`tracing enabled (exporter=${cfg.exporter}, captureContent=${cfg.captureContent})`);
  return true;
}

export function isOtelEnabled(): boolean {
  return !!provider;
}
export function captureContent(): boolean {
  return !!activeConfig?.captureContent && isOtelEnabled();
}
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

export function injectTraceContext(
  ctx: Context = context.active(),
): Record<string, string> | undefined {
  if (!provider) return undefined;
  const carrier: Record<string, string> = {};
  propagation.inject(ctx, carrier);
  return carrier.traceparent ? carrier : undefined;
}

export function contextFromCarrier(carrier?: Record<string, string>): Context {
  return carrier?.traceparent ? propagation.extract(context.active(), carrier) : context.active();
}

export interface SpanOptions {
  attributes?: Attributes;
  kind?: SpanKind;
  parentContext?: Context;
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  opts: SpanOptions = {},
): Promise<T> {
  const parent = opts.parentContext ?? context.active();
  const span = getTracer().startSpan(
    name,
    { kind: opts.kind ?? SpanKind.INTERNAL, attributes: opts.attributes },
    parent,
  );
  const active = trace.setSpan(parent, span);
  try {
    return await context.with(active, () => fn(span));
  } catch (error) {
    recordException(span, error);
    throw error;
  } finally {
    span.end();
  }
}

export function startSpan(name: string, opts: SpanOptions = {}): { span: Span; context: Context } {
  const parent = opts.parentContext ?? context.active();
  const span = getTracer().startSpan(
    name,
    { kind: opts.kind ?? SpanKind.INTERNAL, attributes: opts.attributes },
    parent,
  );
  return { span, context: trace.setSpan(parent, span) };
}

export function recordException(span: Span, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  span.recordException(error instanceof Error ? error : { message });
  span.setStatus({ code: SpanStatusCode.ERROR, message });
}

export function setAttrs(span: Span, attrs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== '')
      span.setAttribute(key, value as never);
  }
}

export function safeAttr(value: unknown, max = 4000): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}…(+${text.length - max} chars)` : text;
}

export async function shutdownOtel(): Promise<void> {
  if (!provider) return;
  try {
    await provider.forceFlush();
    await provider.shutdown();
  } catch (error) {
    log.warn('otel shutdown error:', error);
  } finally {
    provider = undefined;
  }
}

export { SpanKind, SpanStatusCode };
export type { Span };
