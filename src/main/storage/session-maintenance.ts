import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../logger';
import { load } from './json-store';
import { Paths } from './paths';
import { metaSchema } from './session-meta';
import { SUBAGENT_DIR_NAME } from '../../shared/subagent-storage';

const log = createLogger('session-maintenance');

function messagesPath(id: string): string {
  return join(Paths.sessionsDir(), id, 'messages.jsonl');
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
      rmSync(join(Paths.sessionsDir(), id), { recursive: true, force: true });
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

      rmSync(join(Paths.sessionsDir(), id), { recursive: true, force: true });
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
