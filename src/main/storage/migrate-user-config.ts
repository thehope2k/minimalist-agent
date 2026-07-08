// One-time migration: userData/agents/, userData/skills/, userData/extensions/
// → ~/.minimalist-agent/agents/, skills/, extensions/
//
// Safe by design:
//   - Idempotent: guarded by a marker file in userData.
//   - Non-destructive: source directories in userData are NOT deleted.
//     The originals remain until cleaned up by the user or a future migration.
//   - Only writes the marker when ALL directories succeed, so a partial
//     failure (permissions, disk full) is retried on the next launch.

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { homedir } from 'node:os';
import { createLogger } from '../logger';

const log = createLogger('migrate-user-config');

const DIRS_TO_MIGRATE = ['agents', 'skills', 'extensions'] as const;

function userDataRoot(): string {
  return app.getPath('userData');
}

function userConfigRoot(): string {
  return join(homedir(), '.minimalist-agent');
}

function markerPath(): string {
  return join(userDataRoot(), '.user-config-migrated');
}

/** Recursively copy src directory into dest directory (dest created if absent). */
function copyDir(src: string, dest: string): number {
  if (!existsSync(src)) return 0;
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copied += copyDir(srcPath, destPath);
    } else {
      if (!existsSync(destPath)) {
        copyFileSync(srcPath, destPath);
        copied++;
      }
    }
  }
  return copied;
}

/**
 * Run the one-time migration of user-owned config from userData to
 * ~/.minimalist-agent/. Safe to call on every startup — no-ops if already done.
 */
export function runUserConfigMigration(): void {
  const marker = markerPath();

  // Already migrated — skip.
  if (existsSync(marker)) return;

  const userData = userDataRoot();
  const userConfig = userConfigRoot();

  let totalCopied = 0;
  const results: string[] = [];

  let hasError = false;
  for (const dir of DIRS_TO_MIGRATE) {
    const src = join(userData, dir);
    if (!existsSync(src)) {
      results.push(`${dir}: skipped (not found)`);
      continue;
    }
    const dest = join(userConfig, dir);
    try {
      const copied = copyDir(src, dest);
      totalCopied += copied;
      results.push(`${dir}: copied ${copied} files`);
    } catch (err) {
      hasError = true;
      log.error(`Failed to migrate ${dir}`, err);
      results.push(`${dir}: error — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (hasError) {
    // Do NOT write marker — migration will retry on next launch.
    log.warn('Migration incomplete — marker not written; will retry on next launch', { results });
    return;
  }

  // All dirs succeeded — write marker so we don't run again.
  try {
    writeFileSync(marker, JSON.stringify({
      migratedAt: new Date().toISOString(),
      results,
      totalCopied,
    }, null, 2));
    log.info(`User config migration complete: ${totalCopied} files migrated`, { results });
  } catch (err) {
    log.warn('Failed to write migration marker', err);
  }
}

/** Read migration result for diagnostics (returns null if not yet run). */
export function getMigrationStatus(): { migratedAt: string; results: string[]; totalCopied: number } | null {
  const marker = markerPath();
  if (!existsSync(marker)) return null;
  try {
    return JSON.parse(readFileSync(marker, 'utf-8'));
  } catch {
    return null;
  }
}
