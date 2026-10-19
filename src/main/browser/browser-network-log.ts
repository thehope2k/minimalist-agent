// Request log for one browser pane, recorded through Electron's `webRequest`
// hooks on the pane's own session partition. Unlike CDP Network events this
// keeps recording while the debugger is idle-detached. No response bodies —
// status, timing, and errors cover "why did my app's API call fail".
import type { Session } from 'electron';

const MAX_ENTRIES = 300;
const URL_FILTER = { urls: ['http://*/*', 'https://*/*'] };
// Asset noise hidden unless the caller asks for everything.
const STATIC_TYPES = new Set(['image', 'font', 'stylesheet', 'media', 'cspReport', 'ping']);

export interface NetworkEntry {
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  error?: string;
  fromCache: boolean;
  durationMs?: number;
  timestamp: number;
}

export interface NetworkQuery {
  limit: number;
  failedOnly?: boolean;
  /** Case-insensitive URL substring. */
  filter?: string;
  includeStatic?: boolean;
}

interface RequestDetails {
  id: number;
  url: string;
  method: string;
  resourceType: string;
  timestamp: number;
}

export class NetworkLog {
  private entries: NetworkEntry[] = [];
  private startedAt = new Map<number, number>();

  constructor(session: Session) {
    session.webRequest.onSendHeaders(URL_FILTER, (d) => {
      this.startedAt.set(d.id, d.timestamp);
    });
    session.webRequest.onCompleted(URL_FILTER, (d) => {
      this.record(d, { status: d.statusCode, fromCache: d.fromCache });
    });
    session.webRequest.onErrorOccurred(URL_FILTER, (d) => {
      this.record(d, { error: d.error, fromCache: d.fromCache });
    });
  }

  private record(
    d: RequestDetails,
    outcome: { status?: number; error?: string; fromCache: boolean },
  ): void {
    const started = this.startedAt.get(d.id);
    this.startedAt.delete(d.id);
    this.entries.push({
      method: d.method,
      url: d.url,
      resourceType: d.resourceType,
      ...outcome,
      durationMs: started !== undefined ? Math.round(d.timestamp - started) : undefined,
      timestamp: d.timestamp,
    });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  query({ limit, failedOnly, filter, includeStatic }: NetworkQuery): NetworkEntry[] {
    const needle = filter?.toLowerCase();
    return this.entries
      .filter((e) => includeStatic || !STATIC_TYPES.has(e.resourceType))
      .filter((e) => !failedOnly || e.error !== undefined || (e.status ?? 0) >= 400)
      .filter((e) => !needle || e.url.toLowerCase().includes(needle))
      .slice(-limit);
  }
}

export function formatNetworkEntry(e: NetworkEntry): string {
  const status = e.error ? `ERR ${e.error}` : String(e.status ?? '???');
  const duration = e.durationMs !== undefined ? ` ${e.durationMs}ms` : '';
  const cached = e.fromCache ? ' (cache)' : '';
  return `${status} ${e.method} ${e.resourceType}${duration}${cached} ${e.url}`;
}
