// Renderer-side cache + subscription layer over the main-process sessions
// store. Mirrors the pattern in `connections.ts`: snapshot reads are sync
// after a one-time bootstrap; mutations are async and refresh the cache.

import type {
  PermissionMode,
  SessionMeta,
  SessionSummary,
  StoredMessage,
} from './electron';
import { snapshot as connectionsSnapshot } from './connections';
import { buildTitleSample } from './title';
import { chatFromStored } from './chat';

export type { PermissionMode, SessionMeta, SessionSummary, StoredMessage };

let cache: SessionSummary[] | null = null;
let bootPromise: Promise<SessionSummary[]> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

async function load(): Promise<SessionSummary[]> {
  return window.api.sessions.list();
}

export function bootstrap(): Promise<SessionSummary[]> {
  if (cache) return Promise.resolve(cache);
  if (!bootPromise) {
    bootPromise = load()
      .then((s) => {
        // Only write cache if reload() hasn't already populated it with
        // fresher data while this IPC round-trip was in-flight.
        if (!cache) cache = s;
        return cache!;
      })
      .catch((err) => {
        // Allow a future bootstrap() call to retry.
        bootPromise = null;
        throw err;
      });
  }
  return bootPromise;
}

export function snapshot(): SessionSummary[] {
  if (!cache) throw new Error('Sessions store not bootstrapped yet.');
  return cache;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function reload(): Promise<void> {
  cache = await load();
  notify();
}

/* ---------- mutations ---------- */

export async function createSession(opts?: {
  workingDirectory?: string;
  projectId?: string | null;
}): Promise<SessionMeta> {
  const meta = await window.api.sessions.create(opts);
  await reload();
  return meta;
}

export async function setSessionProject(
  id: string,
  projectId: string | null,
): Promise<void> {
  await window.api.sessions.setProject(id, projectId);
  await reload();
}

export async function loadFullSession(
  id: string,
): Promise<{ meta: SessionMeta; messages: StoredMessage[] } | null> {
  return window.api.sessions.load(id);
}

export async function appendMessage(
  id: string,
  msg: StoredMessage,
): Promise<void> {
  await window.api.sessions.appendMessage(id, msg);
  await reload();
}

export async function replaceLastMessage(
  id: string,
  msg: StoredMessage,
): Promise<void> {
  await window.api.sessions.replaceLastMessage(id, msg);
  // Intentionally no reload() here.
  // replaceLastMessage is an in-place content update — the session list
  // sort order, title, and project membership don't change. reload() was
  // causing the full session list to be re-fetched and re-sorted every ~1 s
  // per streaming session (checkpoint interval), making sessions visibly
  // jump in the sidebar while multiple turns ran simultaneously.
}

export async function updateSessionMeta(
  id: string,
  patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
): Promise<void> {
  await window.api.sessions.updateMeta(id, patch);
  await reload();
}

/** Convenience wrapper for the permission-mode pill in MessageInput. */
export async function setSessionPermissionMode(
  id: string,
  mode: PermissionMode,
): Promise<void> {
  await updateSessionMeta(id, { permissionMode: mode });
}

export async function deleteSession(id: string): Promise<void> {
  await window.api.sessions.delete(id);
  await reload();
}

/**
 * Regenerate a session's title via the cheap LLM. Uses the workspace's
 * default connection. Throws on no-connection or no-messages — callers
 * surface the error in the UI.
 */
export async function regenerateSessionTitle(id: string): Promise<string | null> {
  const snap = connectionsSnapshot();
  const slug =
    snap.defaultSlug ?? snap.connections[0]?.slug ?? undefined;
  if (!slug) {
    throw new Error('Add an AI connection in Settings → AI to use this.');
  }

  const data = await loadFullSession(id);
  if (!data || data.messages.length === 0) {
    throw new Error('No messages to summarize.');
  }
  const sample = buildTitleSample(data.messages.map(chatFromStored));
  if (sample.length === 0) {
    throw new Error('No content to summarize.');
  }

  const title = await window.api.chat.generateTitle({
    connectionSlug: slug,
    messages: sample,
    sessionId: id,
    cwd: data.meta.workingDirectory,
  });
  if (!title) return null;
  await updateSessionMeta(id, { title });
  return title;
}

/**
 * Drop all messages in a session from `firstDroppedId` onward (inclusive).
 * Used by the retry flow to prune the failed user/assistant pair before
 * the new turn replays.
 */
export async function truncateSessionMessages(
  id: string,
  firstDroppedId: string,
): Promise<void> {
  await window.api.sessions.truncateFrom(id, firstDroppedId);
}
