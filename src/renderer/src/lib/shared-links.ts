// Local record of links published via the ephemeral host, so the user can copy
// or revoke them later. Stored per session in localStorage. Expired entries are
// pruned on read (the host deletes them server-side at TTL anyway).

import type { SharedExportResult } from './electron';
import type { ExportMode } from './session-export';

const KEY = 'session-shared-links';

export interface SharedLinkRecord {
  sessionId: string;
  mode: ExportMode;
  url: string;
  namespace: string;
  id: string;
  ownerToken: string;
  expiresAt: string;
  createdAt: number;
}

function readAll(): SharedLinkRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SharedLinkRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: SharedLinkRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(records));
}

function notExpired(r: SharedLinkRecord): boolean {
  if (!r.expiresAt) return true;
  const t = Date.parse(r.expiresAt);
  return Number.isNaN(t) || t > Date.now();
}

/** Live (non-expired) links for a session, newest first. */
export function listSharedLinks(sessionId: string): SharedLinkRecord[] {
  const live = readAll().filter(notExpired);
  writeAll(live); // prune expired as a side effect
  return live
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function recordSharedLink(
  sessionId: string,
  mode: ExportMode,
  result: SharedExportResult,
): SharedLinkRecord {
  const record: SharedLinkRecord = {
    sessionId,
    mode,
    url: result.url,
    namespace: result.namespace,
    id: result.id,
    ownerToken: result.ownerToken,
    expiresAt: result.expiresAt,
    createdAt: Date.now(),
  };
  writeAll([record, ...readAll().filter(notExpired)]);
  return record;
}

export function forgetSharedLink(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}
