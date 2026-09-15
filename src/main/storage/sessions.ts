// Sessions storage. Each session is a directory under <userData>/sessions/{id}/
// containing:
//   - session.json   : versioned metadata (title, cwd, sdk session id, …)
//   - messages.jsonl : append-only log of one message per line
//
// Listing reads only session.json files (cheap). Loading a single session
// also reads messages.jsonl line-by-line into memory — fine for chat-sized
// conversations; if these grow huge we'd switch to range reads later.

import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Paths } from './paths';
import { load, save } from './json-store';
import {
  readJsonlFile,
  replaceStoredMessage,
  truncateStoredMessages,
  writeStoredMessages,
} from './message-log';
import { metaSchema } from './session-meta';
import type { SessionMeta, StoredMessage } from './session-types';
export type {
  AttachmentType,
  ChatRole,
  MessageUsage,
  SessionMeta,
  SessionUsage,
  StoredAttachment,
  StoredMessage,
  StoredMessagePart,
} from './session-types';
import { invalidateContextFileCache } from '../agent-runtime/system-prompt';
import { findProjectForPath } from './projects';
import { createLogger } from '../logger';
import { persistSessionBranch } from './session-branch';

const log = createLogger('sessions');

function messagesPath(id: string): string {
  return join(Paths.sessionsDir(), id, 'messages.jsonl');
}

function ensureSessionDir(id: string): void {
  mkdirSync(join(Paths.sessionsDir(), id), { recursive: true });
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* -------------------------- public API -------------------------- */

export function listSessions(): SessionMeta[] {
  const dir = Paths.sessionsDir();
  if (!existsSync(dir)) return [];
  const ids = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const out: SessionMeta[] = [];
  for (const id of ids) {
    const metaFile = join(dir, id, 'session.json');
    if (!existsSync(metaFile)) continue;
    try {
      const meta = load(metaSchema(id));
      out.push({ ...meta, id });
    } catch (err) {
      log.warn(
        `Skipping corrupt/unreadable session ${id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function loadSession(id: string): {
  meta: SessionMeta;
  messages: StoredMessage[];
} | null {
  const metaFile = join(Paths.sessionsDir(), id, 'session.json');
  if (!existsSync(metaFile)) return null;

  const meta = load(metaSchema(id));
  meta.id = id;

  const mp = messagesPath(id);
  let malformedLines = 0;
  const messages = existsSync(mp)
    ? readJsonlFile<StoredMessage>(mp, { onMalformedLine: () => malformedLines++ })
    : [];
  if (malformedLines > 0) {
    log.warn(`Ignored ${malformedLines} malformed message-log line(s) for session ${id}`);
  }
  return { meta, messages };
}

export function createSession(opts?: {
  workingDirectory?: string;
  projectId?: string | null;
}): SessionMeta {
  const id = genId();
  ensureSessionDir(id);
  const now = Date.now();
  // Auto-assign projectId from cwd unless caller supplied an explicit value.
  let projectId: string | null = opts?.projectId ?? null;
  if (projectId === null && opts?.workingDirectory) {
    const match = findProjectForPath(opts.workingDirectory);
    if (match) projectId = match.id;
  }
  const meta: SessionMeta = {
    id,
    title: 'New session',
    archived: false,
    createdAt: now,
    lastMessageAt: now,
    workingDirectory: opts?.workingDirectory,
    projectId,
  };
  save(metaSchema(id), meta);
  // Touch messages file so listing/append never has to mkdir.
  writeFileSync(messagesPath(id), '', 'utf-8');
  return meta;
}

/**
 * Re-assign a session to a project (or Inbox if `projectId === null`).
 * Returns the updated meta.
 */
export function setSessionProject(id: string, projectId: string | null): SessionMeta {
  return updateSessionMeta(id, { projectId });
}

/**
 * Clear `projectId` on every session that pointed at the given project.
 * Called after a project is deleted; affected sessions move to Inbox.
 * Returns the count of sessions touched.
 */
export function clearProjectFromSessions(projectId: string): number {
  const dir = Paths.sessionsDir();
  if (!existsSync(dir)) return 0;
  const ids = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  let n = 0;
  for (const id of ids) {
    const metaFile = join(dir, id, 'session.json');
    if (!existsSync(metaFile)) continue;
    try {
      const meta = load(metaSchema(id));
      if (meta.projectId === projectId) {
        meta.projectId = null;
        save(metaSchema(id), meta);
        n++;
      }
    } catch {
      // skip corrupt
    }
  }
  return n;
}

export function appendMessage(id: string, msg: StoredMessage): void {
  ensureSessionDir(id);
  appendFileSync(messagesPath(id), JSON.stringify(msg) + '\n', 'utf-8');
  // Bump lastMessageAt + auto-title on first user message.
  const meta = load(metaSchema(id));
  meta.id = id;
  meta.lastMessageAt = msg.createdAt;
  if (msg.role === 'user' && (meta.title === 'New session' || meta.title.trim() === '')) {
    meta.title = makeTitle(msg.content);
  }
  save(metaSchema(id), meta);
}

/**
 * Replace the last message in a session — used when the assistant stream
 * finishes and we want to persist the final accumulated content rather than
 * appending each delta. Caller passes the same `id` they used in chat:send.
 */
export function replaceLastMessage(id: string, msg: StoredMessage): void {
  ensureSessionDir(id);
  if (!replaceStoredMessage(messagesPath(id), msg)) appendMessage(id, msg);
}

/**
 * Rewrite the entire messages file with the provided array. Used when
 * mid-turn insertion changes the order (e.g., compaction markers, steer
 * messages) and we need to persist the correct in-memory order to disk.
 */
export function rewriteMessages(id: string, messages: StoredMessage[]): void {
  ensureSessionDir(id);
  writeStoredMessages(messagesPath(id), messages);

  // Update lastMessageAt from the last message's createdAt
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    const meta = load(metaSchema(id));
    meta.id = id;
    meta.lastMessageAt = lastMsg.createdAt;
    save(metaSchema(id), meta);
  }
}

export function updateSessionMeta(
  id: string,
  patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
): SessionMeta {
  const meta = load(metaSchema(id));
  meta.id = id;
  const prevCwd = meta.workingDirectory;
  Object.assign(meta, patch);
  save(metaSchema(id), meta);
  // Drop cached AGENTS.md/CLAUDE.md walk when the working directory
  // changes. The walk is otherwise cached for 5 minutes per directory.
  if ('workingDirectory' in patch && patch.workingDirectory !== prevCwd) {
    if (prevCwd) invalidateContextFileCache(prevCwd);
    if (patch.workingDirectory) invalidateContextFileCache(patch.workingDirectory);
  }
  return meta;
}

export function deleteSession(id: string): void {
  rmSync(join(Paths.sessionsDir(), id), { recursive: true, force: true });
}

/**
 * Pin a scoped asset to a session's persistent context.
 * `scopedSlug` format: 'user:<slug>' | 'project:<slug>'
 * No-op if already pinned.
 */
export function pinAsset(sessionId: string, scopedSlug: string): SessionMeta {
  const meta = load(metaSchema(sessionId));
  meta.id = sessionId;
  const pins = meta.pinnedAssets ?? [];
  if (!pins.includes(scopedSlug)) {
    meta.pinnedAssets = [...pins, scopedSlug];
    save(metaSchema(sessionId), meta);
  }
  return meta;
}

/**
 * Unpin a scoped asset from a session's persistent context.
 * No-op if not pinned.
 */
export function unpinAsset(sessionId: string, scopedSlug: string): SessionMeta {
  const meta = load(metaSchema(sessionId));
  meta.id = sessionId;
  meta.pinnedAssets = (meta.pinnedAssets ?? []).filter((s) => s !== scopedSlug);
  save(metaSchema(sessionId), meta);
  return meta;
}

/**
 * Create a new session that branches off `parentId` at the given message.
 * All messages *before* `upToMessageId` are copied into the new session,
 * giving the AI the full shared context without the divergence point itself
 * (the caller pre-fills that text in the renderer input so the user can
 * edit and re-send it as the first message of the new thread).
 *
 * Returns the new `SessionMeta`, or `null` when the parent or message id
 * can't be resolved.
 */
export async function branchSession(
  parentId: string,
  upToMessageId: string,
  options?: { withContext?: boolean },
): Promise<SessionMeta | null> {
  const parent = loadSession(parentId);
  if (!parent) return null;

  const cutIndex = parent.messages.findIndex((message) => message.id === upToMessageId);
  if (cutIndex < 0) return null;

  const id = genId();
  ensureSessionDir(id);
  return persistSessionBranch({ parentId, parent, cutIndex, id, options });
}

/**
 * Drop all messages from `firstDroppedId` onward (inclusive). Used by the
 * “retry” flow so the failed user/assistant pair doesn't pile up in the
 * persisted log when the user replays the turn.
 *
 * No-op if the message id isn't found; returns the number of messages
 * remaining after truncation.
 */
export function truncateMessagesFrom(id: string, firstDroppedId: string): number {
  ensureSessionDir(id);
  return truncateStoredMessages(messagesPath(id), firstDroppedId);
}

export {
  pruneArchivedSessions,
  pruneEmptySessions,
  pruneSubagentDirs,
} from './session-maintenance';
export { listSessionFiles, sessionPath, type SessionFileNode } from './session-files';

/* -------------------------- internals -------------------------- */

function makeTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine || 'New session';
}
