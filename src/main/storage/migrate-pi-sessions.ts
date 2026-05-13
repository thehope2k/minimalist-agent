/**
 * One-time migration: move Pi session JSONL files from the wrong location to
 * the correct one.
 *
 * Root cause (pre-v0.8.3):
 *   pi-server/index.ts called `SessionManager.create(msg.sessionPath)`, which
 *   treated `msg.sessionPath` (our userData sessions dir) as the `cwd`
 *   argument instead of the session-dir argument. Pi then computed its own
 *   session directory via `getDefaultSessionDir(cwd)`, encoding the path as
 *   `--<cwd-with-slashes-as-hyphens>--` under `~/.pi/agent/sessions/`.
 *
 * After the fix:
 *   `SessionManager.continueRecent(msg.cwd, msg.sessionPath)` passes
 *   `msg.sessionPath` as `sessionDir`, so Pi writes JSONL directly into our
 *   userData session folder and `continueRecent` can find it there on the
 *   next subprocess start.
 *
 * This migration:
 *   1. Lists all known session IDs from our userData sessions dir.
 *   2. For each session that has no Pi JSONL yet, reconstructs the wrong Pi
 *      path and copies any JSONL files found there into our session dir.
 *   3. Marks completion in `userData/pi-sessions-migrated.json` so it only
 *      runs once per install.
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Paths } from './paths';

const MIGRATION_FLAG = () => join(Paths.root(), 'pi-sessions-migrated.json');
const PI_SESSIONS_BASE = () => join(homedir(), '.pi', 'agent', 'sessions');

/**
 * Reconstruct the wrong Pi session directory that was used before the v0.8.3 fix.
 * Pi's `getDefaultSessionDir(cwd)` encodes cwd as:
 *   `--<cwd with leading /\\ stripped, remaining /\\: replaced by ->--`
 * placed under `~/.pi/agent/sessions/`.
 */
function wrongPiSessionDir(sessionStoragePath: string): string {
  const safePath = `--${sessionStoragePath
    .replace(/^[/\\]/, '')
    .replace(/[/\\:]/g, '-')}--`;
  return join(PI_SESSIONS_BASE(), safePath);
}

/** Return true if `dir` contains at least one Pi-style JSONL session file. */
function hasPiJsonl(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith('.jsonl') && /^\d{4}-/.test(f));
}

/**
 * Run the migration at app startup. No-ops if already run or if there is
 * nothing to migrate. Safe to call multiple times.
 */
export function migratePiSessions(): void {
  const flagFile = MIGRATION_FLAG();

  // Already migrated on a previous launch.
  if (existsSync(flagFile)) return;

  const sessionsDir = Paths.sessionsDir();
  if (!existsSync(sessionsDir)) {
    // Nothing to migrate yet; write flag so we don't check again.
    writeFileSync(flagFile, JSON.stringify({ migratedAt: new Date().toISOString(), count: 0 }));
    return;
  }

  const sessionIds = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  let moved = 0;
  const errors: string[] = [];

  for (const id of sessionIds) {
    const targetDir = join(sessionsDir, id);

    // Skip sessions that already have a Pi JSONL (created with v0.8.3+).
    if (hasPiJsonl(targetDir)) continue;

    // Find the wrong Pi session dir for this session.
    const wrongDir = wrongPiSessionDir(targetDir);
    if (!existsSync(wrongDir)) continue;

    // Copy every Pi JSONL from the wrong dir into the correct session dir.
    let copiedForSession = false;
    try {
      const files = readdirSync(wrongDir).filter(
        (f) => f.endsWith('.jsonl') && /^\d{4}-/.test(f),
      );
      for (const f of files) {
        const src = join(wrongDir, f);
        const dst = join(targetDir, f);
        if (!existsSync(dst)) {
          mkdirSync(targetDir, { recursive: true });
          copyFileSync(src, dst);
          copiedForSession = true;
        }
      }
      if (copiedForSession) moved++;
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (moved > 0 || errors.length === 0) {
    console.log(`[migrate-pi-sessions] restored Pi context for ${moved}/${sessionIds.length} sessions`);
  }
  if (errors.length > 0) {
    console.warn('[migrate-pi-sessions] errors (non-fatal):', errors);
  }

  // Write flag — even if some sessions had errors we don't want to retry on
  // every launch (the ones that failed likely have no data to rescue).
  writeFileSync(
    flagFile,
    JSON.stringify({
      migratedAt: new Date().toISOString(),
      total: sessionIds.length,
      moved,
      errors,
    }),
  );
}
