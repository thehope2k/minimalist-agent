// Versioned JSON read/write with backup-before-migrate semantics.
//
// Every persistent file is shaped { version: number, ...payload }. On read:
//   - if file is missing → return defaultValue
//   - if version is unknown / too new → throw (refuse to start)
//   - if version is older → run migrations forward, take a backup first
//   - if version matches → return as-is
//
// On write: bump to current version, write atomically (via .tmp + rename).

import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Paths, MIGRATION_BACKUP_RETENTION } from './paths';
import { readdirSync, rmSync } from 'node:fs';

export interface FileSchema<T> {
  /** Filesystem path to the file. */
  path: string;
  /** Latest schema version this codebase understands. */
  currentVersion: number;
  /** Default content for a brand-new file. */
  defaultValue: T;
  /**
   * Migrations indexed by `from` version. Entry at index N migrates v(N) → v(N+1).
   * Length must be `currentVersion`. Index 0 migrates from v0 (legacy/unset).
   */
  migrations: Array<(prev: unknown) => T>;
  /** Optional validator run after read/migrate. Throw to refuse data. */
  validate?: (data: T) => void;
}

interface VersionedEnvelope<T> {
  version: number;
  data: T;
}

function readEnvelope<T>(path: string): VersionedEnvelope<T> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as VersionedEnvelope<T>;
    if (typeof parsed?.version !== 'number') return null;
    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse ${basename(path)}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, path);
}

function backupBeforeMigrate(filePath: string): void {
  if (!existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(Paths.backupsDir(), stamp);
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(filePath, join(backupDir, basename(filePath)));
  pruneOldBackups();
}

function pruneOldBackups(): void {
  const dir = Paths.backupsDir();
  const entries = readdirSync(dir).sort(); // ISO timestamps sort lexically
  const excess = entries.length - MIGRATION_BACKUP_RETENTION;
  for (let i = 0; i < excess; i++) {
    rmSync(join(dir, entries[i]), { recursive: true, force: true });
  }
}

/**
 * Load a versioned JSON file, running any forward migrations needed.
 * Throws if the file is corrupt or its version is newer than this codebase
 * supports.
 */
export function load<T>(schema: FileSchema<T>): T {
  const env = readEnvelope<T>(schema.path);
  if (!env) return schema.defaultValue;

  if (env.version > schema.currentVersion) {
    throw new Error(
      `${basename(schema.path)} was created by a newer version (v${env.version}). ` +
        `This build supports up to v${schema.currentVersion}. Update the app.`,
    );
  }

  let data: unknown = env.data;
  if (env.version < schema.currentVersion) {
    backupBeforeMigrate(schema.path);
    for (let v = env.version; v < schema.currentVersion; v++) {
      data = schema.migrations[v](data);
    }
    // Persist the migrated form so we don't migrate again on next boot.
    save(schema, data as T);
  }

  schema.validate?.(data as T);
  return data as T;
}

export function save<T>(schema: FileSchema<T>, data: T): void {
  const envelope: VersionedEnvelope<T> = {
    version: schema.currentVersion,
    data,
  };
  writeAtomic(schema.path, JSON.stringify(envelope, null, 2));
}
