// Request log for one browser pane, recorded through Electron's `webRequest`
// hooks on the pane's session partition. Unlike CDP Network events this
// keeps recording while the debugger is idle-detached. No response bodies —
// status, timing, and errors cover "why did my app's API call fail".
//
// `webRequest` allows one listener per event per session, and with the shared
// profile several panes share a session — so each session gets one set of
// listeners that routes by webContentsId.
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
  webContentsId?: number;
}

const routers = new WeakMap<Session, Map<number, NetworkLog>>();

function routerFor(session: Session): Map<number, NetworkLog> {
  const existing = routers.get(session);
  if (existing) return existing;
  const logs = new Map<number, NetworkLog>();
  routers.set(session, logs);
  const route = (d: RequestDetails) =>
    d.webContentsId !== undefined ? logs.get(d.webContentsId) : undefined;
  session.webRequest.onSendHeaders(URL_FILTER, (d) => route(d)?.start(d));
  session.webRequest.onCompleted(URL_FILTER, (d) =>
    route(d)?.record(d, { status: d.statusCode, fromCache: d.fromCache }),
  );
  session.webRequest.onErrorOccurred(URL_FILTER, (d) =>
    route(d)?.record(d, { error: d.error, fromCache: d.fromCache }),
  );
  return logs;
}

export class NetworkLog {
  private entries: NetworkEntry[] = [];
  private startedAt = new Map<number, number>();
  private lastActivityAt = Date.now();

  constructor(
    private readonly session: Session,
    private readonly webContentsId: number,
  ) {
    routerFor(session).set(webContentsId, this);
  }

  dispose(): void {
    routerFor(this.session).delete(this.webContentsId);
  }

  /** Requests sent but not yet completed or failed. */
  get inFlight(): number {
    return this.startedAt.size;
  }

  /** Epoch ms of the last request start or finish. */
  get lastActivity(): number {
    return this.lastActivityAt;
  }

  start(d: RequestDetails): void {
    this.startedAt.set(d.id, d.timestamp);
    this.lastActivityAt = Date.now();
  }

  record(
    d: RequestDetails,
    outcome: { status?: number; error?: string; fromCache: boolean },
  ): void {
    const started = this.startedAt.get(d.id);
    this.startedAt.delete(d.id);
    this.lastActivityAt = Date.now();
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
