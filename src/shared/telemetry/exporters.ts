import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { Logger } from '../log';
import { DEFAULT_TRACES_MAX_BYTES } from './config';

function hrToMs(t: [number, number]): number {
  return t[0] * 1e3 + t[1] / 1e6;
}

export function serializeSpan(s: ReadableSpan): Record<string, unknown> {
  const ctx = s.spanContext();
  const resourceAttrs = s.resource.attributes;
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: s.parentSpanContext?.spanId,
    name: s.name,
    kind: SpanKind[s.kind],
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
    resource: {
      ...resourceAttrs,
      _rawAttributes: Object.entries(resourceAttrs).map(([k, v]) => [k, v]),
    },
  };
}

export class JsonlFileSpanExporter implements SpanExporter {
  private failed = false;
  private bytes = 0;
  private readonly maxBytes: number;

  constructor(
    private readonly file: string,
    private readonly log: Logger,
    maxBytes = DEFAULT_TRACES_MAX_BYTES,
  ) {
    this.maxBytes = maxBytes > 0 ? maxBytes : DEFAULT_TRACES_MAX_BYTES;
    try {
      mkdirSync(dirname(file), { recursive: true });
    } catch (error) {
      this.failed = true;
      log.warn('could not create traces dir:', error);
      return;
    }
    try {
      this.bytes = statSync(file).size;
    } catch {
      // File does not exist yet.
    }
  }

  private rotate(): void {
    try {
      renameSync(this.file, `${this.file}.old`);
      this.bytes = 0;
    } catch (error) {
      this.log.warn('traces rotation failed:', error);
    }
  }

  export(spans: ReadableSpan[], resultCallback: (r: ExportResult) => void): void {
    if (this.failed) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }
    try {
      const lines = spans.map((span) => JSON.stringify(serializeSpan(span))).join('\n') + '\n';
      const size = Buffer.byteLength(lines);
      if (this.bytes > 0 && this.bytes + size > this.maxBytes) this.rotate();
      appendFileSync(this.file, lines);
      this.bytes += size;
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      this.log.warn('span export failed:', error);
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

export class StderrSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (r: ExportResult) => void): void {
    for (const span of spans)
      process.stderr.write(`[otel-span] ${JSON.stringify(serializeSpan(span))}\n`);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
