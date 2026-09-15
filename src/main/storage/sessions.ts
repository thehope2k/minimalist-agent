// Sessions storage. Each session is a directory under <userData>/sessions/{id}/
// containing:
//   - session.json   : versioned metadata (title, cwd, sdk session id, …)
//   - messages.jsonl : append-only log of one message per line
//
// Listing reads only session.json files (cheap). Loading a single session
// also reads messages.jsonl line-by-line into memory — fine for chat-sized
// conversations; if these grow huge we'd switch to range reads later.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Paths } from './paths';
import { load, save } from './json-store';
import { readJsonlFile } from './message-log';
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
import { listConnections } from './connections';
import { forkSessionTranscript } from './session-fork';
import { resolveAuthForSlug } from '../auth/resolve';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import { SUBAGENT_DIR_NAME } from '../../shared/subagent-storage';
import type { Model, Api } from '@earendil-works/pi-ai';

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
  const mp = messagesPath(id);
  if (!existsSync(mp)) {
    appendMessage(id, msg);
    return;
  }
  const raw = readFileSync(mp, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());

  // Find the message with this id; replace if found, append otherwise.
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]) as StoredMessage;
      if (parsed.id === msg.id) {
        idx = i;
        break;
      }
    } catch {
      /* skip */
    }
  }
  if (idx === -1) {
    appendMessage(id, msg);
    return;
  }
  lines[idx] = JSON.stringify(msg);
  writeFileSync(mp, lines.join('\n') + '\n', 'utf-8');
  // Intentionally no meta.lastMessageAt update here.
  // replaceLastMessage is an in-place content write (checkpoint persistence,
  // turn completion). Bumping lastMessageAt on every call caused sessions to
  // continuously re-sort in the sidebar every ~1 s during streaming.
  // lastMessageAt is owned exclusively by appendMessage (new content arrives)
  // and createSession.
}

/**
 * Rewrite the entire messages file with the provided array. Used when
 * mid-turn insertion changes the order (e.g., compaction markers, steer
 * messages) and we need to persist the correct in-memory order to disk.
 */
export function rewriteMessages(id: string, messages: StoredMessage[]): void {
  ensureSessionDir(id);
  const mp = messagesPath(id);
  const lines = messages.map((m) => JSON.stringify(m));
  writeFileSync(mp, lines.length ? lines.join('\n') + '\n' : '', 'utf-8');

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

/** Resolves auth + model for the "Fork with context" branch-summarization
 *  call. Scoped to GitHub Copilot connections; returns undefined (falls
 *  back to a clean cutoff) on any resolution failure. */
async function resolveForkSummarizer(parentMeta: SessionMeta): Promise<
  | {
      model: Model<Api>;
      apiKey: string | undefined;
      headers?: Record<string, string>;
      env?: Record<string, string>;
    }
  | undefined
> {
  if (!parentMeta.connectionSlug || !parentMeta.model) return undefined;
  const conn = listConnections().find((c) => c.slug === parentMeta.connectionSlug);
  if (!conn || conn.providerType !== 'github-copilot') return undefined;

  try {
    const model = getBuiltinModel('github-copilot', parentMeta.model as never);
    if (!model) return undefined;
    const auth = await resolveAuthForSlug(parentMeta.connectionSlug);
    if (auth.type !== 'oauth') return undefined;
    return { model, apiKey: auth.accessToken };
  } catch (e) {
    log.warn('Failed to resolve fork-with-context summarizer, falling back to a clean cutoff:', e);
    return undefined;
  }
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

  const cutIdx = parent.messages.findIndex((m) => m.id === upToMessageId);
  if (cutIdx < 0) return null;

  const id = genId();
  ensureSessionDir(id);
  const now = Date.now();

  const parentTitle = parent.meta.title?.trim();
  const title = parentTitle ? `Branch: ${parentTitle}`.slice(0, 80) : 'New session';

  const meta: SessionMeta = {
    id,
    title,
    archived: false,
    createdAt: now,
    lastMessageAt: now,
    workingDirectory: parent.meta.workingDirectory,
    projectId: parent.meta.projectId ?? null,
    connectionSlug: parent.meta.connectionSlug,
    model: parent.meta.model,
    permissionMode: parent.meta.permissionMode,
  };
  save(metaSchema(id), meta);

  const messagesToCopy = parent.messages.slice(0, cutIdx);
  if (messagesToCopy.length > 0) {
    writeFileSync(
      messagesPath(id),
      messagesToCopy.map((m) => JSON.stringify(m)).join('\n') + '\n',
      'utf-8',
    );
    // Reflect the last copied message's timestamp in the session list.
    meta.lastMessageAt = messagesToCopy[messagesToCopy.length - 1]!.createdAt;
    save(metaSchema(id), meta);
  } else {
    writeFileSync(messagesPath(id), '', 'utf-8');
  }

  const cutoffMs = parent.messages[cutIdx]!.createdAt;
  await forkSessionTranscript({
    parentSessionDir: join(Paths.sessionsDir(), parentId),
    parentRuntimeSessionId: parent.meta.runtimeSessionId,
    newSessionDir: join(Paths.sessionsDir(), id),
    cutoffMs,
    summarizer: options?.withContext ? await resolveForkSummarizer(parent.meta) : undefined,
  });

  return meta;
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
  const mp = messagesPath(id);
  if (!existsSync(mp)) return 0;
  const lines = readFileSync(mp, 'utf-8')
    .split('\n')
    .filter((l) => l.trim());
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]) as StoredMessage;
      if (parsed.id === firstDroppedId) {
        cut = i;
        break;
      }
    } catch {
      /* skip */
    }
  }
  if (cut < 0) return lines.length;
  const kept = lines.slice(0, cut);
  writeFileSync(mp, kept.length ? kept.join('\n') + '\n' : '', 'utf-8');
  return kept.length;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMPTY_SESSION_MAX_AGE_DAYS = 7;

function listSubdirNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** Number of days after which archived sessions are automatically pruned. */
export function pruneArchivedSessions(days: number): number {
  const dir = Paths.sessionsDir();
  if (!existsSync(dir)) return 0;

  const cutoff = Date.now() - days * MS_PER_DAY;
  let pruned = 0;
  for (const id of listSubdirNames(dir)) {
    const metaFile = join(dir, id, 'session.json');
    if (!existsSync(metaFile)) continue;
    try {
      const meta = load(metaSchema(id));
      if (!meta.archived) continue;
      if (meta.lastMessageAt > cutoff) continue;
      deleteSession(id);
      pruned++;
    } catch (err) {
      log.warn(`Skipping corrupt session ${id} during archive prune:`, err);
    }
  }
  return pruned;
}

/**
 * Delete sessions that were opened but never used: still carry the default
 * title AND have an empty messages file. Byte size is a poor proxy for
 * "unused" — even a short Q&A can be small. Title + message count is precise.
 */
export function pruneEmptySessions(): number {
  const dir = Paths.sessionsDir();
  if (!existsSync(dir)) return 0;

  const cutoff = Date.now() - EMPTY_SESSION_MAX_AGE_DAYS * MS_PER_DAY;
  let pruned = 0;
  for (const id of listSubdirNames(dir)) {
    const metaFile = join(dir, id, 'session.json');
    if (!existsSync(metaFile)) continue;
    try {
      const meta = load(metaSchema(id));
      if (meta.lastMessageAt > cutoff) continue;
      if (meta.title !== 'New session') continue;

      const msgFile = messagesPath(id);
      const msgSize = existsSync(msgFile) ? statSync(msgFile).size : 0;
      if (msgSize > 0) continue;

      deleteSession(id);
      pruned++;
    } catch (err) {
      log.warn(`Skipping corrupt session ${id} during empty-session prune:`, err);
    }
  }
  return pruned;
}

/**
 * Sub-agent invocations each get an isolated transcript directory under a
 * session (see {@link subagentDir}). Nothing in the app reads these back
 * once the sub-agent finishes — they exist only for forensic inspection —
 * so unlike the session itself they're safe to prune purely by age,
 * independent of whether the parent session is archived. Sessions that are
 * archived + past retention are already removed whole by
 * {@link pruneArchivedSessions}; this covers the remaining gap: sub-agent
 * dirs inside sessions that stay active indefinitely.
 */
export function pruneSubagentDirs(days: number): number {
  const dir = Paths.sessionsDir();
  if (!existsSync(dir)) return 0;

  const cutoff = Date.now() - days * MS_PER_DAY;
  let pruned = 0;
  for (const id of listSubdirNames(dir)) {
    const subagentsDir = join(dir, id, SUBAGENT_DIR_NAME);
    if (!existsSync(subagentsDir)) continue;

    let execIds: string[];
    try {
      execIds = listSubdirNames(subagentsDir);
    } catch (err) {
      log.warn(`Failed to list sub-agent dirs for session ${id}:`, err);
      continue;
    }

    for (const execId of execIds) {
      const execDir = join(subagentsDir, execId);
      try {
        if (statSync(execDir).mtimeMs > cutoff) continue;
        rmSync(execDir, { recursive: true, force: true });
        pruned++;
      } catch (err) {
        log.warn(`Failed to prune sub-agent dir ${execDir}:`, err);
      }
    }
  }
  return pruned;
}

/** Absolute path to the session's on-disk folder. */
export function sessionPath(id: string): string {
  return join(Paths.sessionsDir(), id);
}

export type SessionFileNode =
  | {
      kind: 'file';
      name: string;
      path: string;
      size: number;
    }
  | {
      kind: 'dir';
      name: string;
      path: string;
      children: SessionFileNode[];
    };

/**
 * Walk the session folder for the Info popover. Skips hidden files only —
 * everything else on disk (meta, append-only message log, attachments, tool
 * outputs) shows up so the panel reflects the full session folder.
 * Folders sorted before files; both alphabetically.
 */
export function listSessionFiles(id: string): SessionFileNode[] {
  const root = sessionPath(id);
  if (!existsSync(root)) return [];
  return walk(root);
}

function walk(dir: string): SessionFileNode[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const out: SessionFileNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ kind: 'dir', name: e.name, path: full, children: walk(full) });
    } else if (e.isFile()) {
      let size = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        size = (require('node:fs') as typeof import('node:fs')).statSync(full).size;
      } catch {
        // ignore unreadable
      }
      out.push({ kind: 'file', name: e.name, path: full, size });
    }
  }
  // dirs first, then files; alphabetical within each.
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/* -------------------------- internals -------------------------- */

function makeTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine || 'New session';
}
