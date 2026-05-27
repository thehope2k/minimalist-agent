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
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';
import { invalidateContextFileCache } from '../agent/system-prompt';
import type { PermissionMode } from './settings';
import { findProjectForPath } from './projects';

export type ChatRole = 'user' | 'assistant';

/**
 * A single rendered piece of a message. Assistant messages can interleave
 * text, thinking, and tool-call segments — older v1.0 sessions only had a
 * flat `content` string and are rehydrated as a single `text` part.
 */
export type StoredMessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input?: unknown;
      partialInputJson?: string;
      result?: { content: string; isError?: boolean };
      status: 'running' | 'done' | 'error';
    };

export type AttachmentType = 'image' | 'pdf' | 'text' | 'snippet';

export interface StoredAttachment {
  type: AttachmentType;
  name: string;
  mimeType: string;
  size: number;
  storedPath: string;
  thumbnailBase64?: string;
  resizedBase64?: string;
  /** Detected or user-set language tag (snippets only). */
  language?: string;
  /** Pre-computed line count (snippets only). */
  lineCount?: number;
}

export interface StoredMessage {
  id: string;
  role: ChatRole;
  /** Legacy plain-text content. New writes still set this for backwards compat. */
  content: string;
  /** Rich segments — preferred shape for assistant messages going forward. */
  parts?: StoredMessagePart[];
  /** Set on assistant messages — the model that produced it. */
  model?: string;
  /** Set when the stream errored on this message. */
  error?: string;
  /** SDK stop_reason for the turn (`end_turn`, `max_turns`, `tool_use`, …). */
  stopReason?: string;
  /** Token counts reported by the SDK on this turn's `result` message. */
  usage?: MessageUsage;
  /** Total wall-clock duration of the turn in milliseconds. */
  durationMs?: number;
  createdAt: number;
  /** User-message attachments. */
  attachments?: StoredAttachment[];
  /**
   * If set, this isn't a normal user/assistant message but a marker line
   * inserted between turns (e.g. compaction boundary). Renderers branch
   * on this BEFORE role and render the row as a divider chip.
   */
  markerKind?: 'compaction';
  /** Populated for `markerKind === 'compaction'`. */
  compactionMeta?: {
    trigger: 'manual' | 'auto';
    preTokens: number;
    postTokens?: number;
    durationMs?: number;
  };
}

/** Per-message token counts. Mirror of renderer-side `AgentUsage`. */
export interface MessageUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface SessionUsage {
  /** Cumulative input tokens reported by the SDK over this session. */
  inputTokens?: number;
  outputTokens?: number;
}

export interface SessionMeta {
  id: string;
  /** First user-message snippet, or 'New session' until set. */
  title: string;
  /** Per-session working directory passed to the SDK as `cwd`. */
  workingDirectory?: string;
  /** SDK's session id from the previous turn — used to resume next turn. */
  sdkSessionId?: string;
  archived: boolean;
  createdAt: number;
  /** Bumped on every append. */
  lastMessageAt: number;
  /** Optional cumulative usage for this session. Added in v2. */
  usage?: SessionUsage;
  /**
   * Per-session permission mode. When unset, the session inherits the global
   * `defaultPermissionMode` from AI settings at send time. Added in v3.
   */
  permissionMode?: PermissionMode;
  /**
   * Project this session belongs to (`null` = Inbox / unassigned). Auto-set
   * at creation by matching `workingDirectory` against project rootPaths.
   * Added in v4.
   */
  projectId?: string | null;
  /**
   * Connection + model the session last sent with. Restored to the pill on
   * session switch so each session "remembers" its choice. Added in v5.
   */
  connectionSlug?: string;
  model?: string;
  /**
   * Per-session SDD mode. 'auto' = scan and inject coaching when entities found.
   * 'off' = skip scan entirely, no panel, no prompt injection. Added in v6.
   * Defaults to 'auto' when absent.
   */
  sddMode?: 'auto' | 'off';
  /**
   * Slug of the feature pinned as active for this session. When set, only
   * that feature's context is injected into the system prompt and lazy rule
   * injection is enabled. Added in v7. Defaults to null when absent.
   */
  activeFeatureSlug?: string | null;
  /**
   * Per-session autonomy level (0-100) for intelligent collaboration.
   * Higher = more independent, lower = more collaborative.
   * Defaults to 50 (balanced) when absent. Added in v8.
   */
  autonomyLevel?: number;
}

export type SessionSummary = SessionMeta;

const META_DEFAULT_FACTORY = (): SessionMeta => ({
  id: '',
  title: 'New session',
  archived: false,
  createdAt: 0,
  lastMessageAt: 0,
});

function metaSchema(id: string): FileSchema<SessionMeta> {
  return {
    path: join(Paths.sessionsDir(), id, 'session.json'),
    currentVersion: 9,
    defaultValue: META_DEFAULT_FACTORY(),
    // Index 0 → v0 (legacy/unset). Index 1 → v1 (no usage field).
    // Index 2 → v2 (no permissionMode field). Index 3 → v3 (no projectId).
    // Index 4 → v4 (no connectionSlug/model). All migrations are additive
    // and idempotent: missing fields stay missing and are filled at use
    // sites with sensible defaults.
    // NOTE: sddMode (added in v6) is a fully optional field that defaults
    // to 'auto' at every call-site — no migration step needed.
    // NOTE: activeFeatureSlug (added in v7) is a fully optional field that
    // defaults to null at every call-site — no migration step needed.
    // NOTE: autonomyLevel (added in v8) is a fully optional field that
    // defaults to 50 at every call-site — no migration step needed.
    // v9: Remove 'ask' permission mode (replaced by intelligent collaboration).
    migrations: [
      (prev) => ({ ...META_DEFAULT_FACTORY(), ...(prev as object) }) as SessionMeta,
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta), projectId: null }) as SessionMeta,
      (prev) => ({ ...(prev as SessionMeta) }),
      // v5 → v6: adds sddMode (optional field, no-op migration).
      (prev) => ({ ...(prev as SessionMeta) }),
      // v6 → v7: adds activeFeatureSlug (optional field, no-op migration).
      (prev) => ({ ...(prev as SessionMeta) }),
      // v7 → v8: adds autonomyLevel (optional field, no-op migration).
      (prev) => ({ ...(prev as SessionMeta) }),
      // v8 → v9: migrate 'ask' → 'auto' (breaking change).
      (prev) => {
        const session = prev as SessionMeta;
        if (session.permissionMode === 'ask' as any) {
          return { ...session, permissionMode: 'auto' };
        }
        return session;
      },
    ],
  };
}

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

export function listSessions(): SessionSummary[] {
  const dir = Paths.sessionsDir();
  if (!existsSync(dir)) return [];
  const ids = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const out: SessionSummary[] = [];
  for (const id of ids) {
    const metaFile = join(dir, id, 'session.json');
    if (!existsSync(metaFile)) continue;
    try {
      const meta = load(metaSchema(id));
      out.push({ ...meta, id });
    } catch {
      // skip corrupt/unreadable sessions
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

  const messages: StoredMessage[] = [];
  const mp = messagesPath(id);
  if (existsSync(mp)) {
    const raw = readFileSync(mp, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        messages.push(JSON.parse(trimmed) as StoredMessage);
      } catch {
        // skip malformed line
      }
    }
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
export function setSessionProject(
  id: string,
  projectId: string | null,
): SessionMeta {
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
  if (
    msg.role === 'user' &&
    (meta.title === 'New session' || meta.title.trim() === '')
  ) {
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
 * Create a new session that branches off `parentId` at the given message.
 * All messages *before* `upToMessageId` are copied into the new session,
 * giving the AI the full shared context without the divergence point itself
 * (the caller pre-fills that text in the renderer input so the user can
 * edit and re-send it as the first message of the new thread).
 *
 * Returns the new `SessionMeta`, or `null` when the parent or message id
 * can't be resolved.
 */
export function branchSession(
  parentId: string,
  upToMessageId: string,
): SessionMeta | null {
  const parent = loadSession(parentId);
  if (!parent) return null;

  const cutIdx = parent.messages.findIndex((m) => m.id === upToMessageId);
  if (cutIdx < 0) return null;

  const id = genId();
  ensureSessionDir(id);
  const now = Date.now();

  const parentTitle = parent.meta.title?.trim();
  const title = parentTitle
    ? `Branch: ${parentTitle}`.slice(0, 80)
    : 'New session';

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
    sddMode: parent.meta.sddMode,
    activeFeatureSlug: parent.meta.activeFeatureSlug,
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
export function truncateMessagesFrom(
  id: string,
  firstDroppedId: string,
): number {
  ensureSessionDir(id);
  const mp = messagesPath(id);
  if (!existsSync(mp)) return 0;
  const lines = readFileSync(mp, 'utf-8').split('\n').filter((l) => l.trim());
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
