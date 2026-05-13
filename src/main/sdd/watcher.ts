import { watch, type FSWatcher } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SddEntity, SddWatchHandle } from './types';

const handles = new Map<string, SddWatchHandle>();
const DEBOUNCE_MS = 200;

// ── Helpers ───────────────────────────────────────────────────────────────────

function createDebouncer(
  onChange: (entityRootPath: string) => void,
  entityRootPath: string,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(entityRootPath), DEBOUNCE_MS);
  };
}

/** Attempt to watch a single directory; silently swallow errors. */
function tryWatch(dirPath: string, trigger: () => void): FSWatcher | null {
  try {
    return watch(dirPath, trigger);
  } catch {
    return null;
  }
}

/**
 * Manually watch a directory tree up to 2 levels deep.
 * Used on Linux where fs.watch with recursive option silently falls back to
 * non-recursive (inotify limitation). The watched tree is always shallow:
 *   level 0 — rootPath/
 *   level 1 — rootPath/{memory,specs,...}
 *   level 2 — rootPath/specs/001-feature-name/  (artifacts live here)
 * Two levels covers everything without needing recursive watching.
 *
 * Called once for .specify/ (constitution) and once for specs/ (modern layout).
 */
async function watchManual(
  rootPath: string,
  trigger: () => void,
  watchers: FSWatcher[],
): Promise<void> {
  const w0 = tryWatch(rootPath, trigger);
  if (w0) watchers.push(w0);

  try {
    const level1 = await fsp.readdir(rootPath, { withFileTypes: true });
    for (const entry of level1) {
      if (!entry.isDirectory()) continue;
      const l1 = join(rootPath, entry.name);
      const w1 = tryWatch(l1, trigger);
      if (w1) watchers.push(w1);

      try {
        const level2 = await fsp.readdir(l1, { withFileTypes: true });
        for (const e2 of level2) {
          if (!e2.isDirectory()) continue;
          const l2 = join(l1, e2.name);
          const w2 = tryWatch(l2, trigger);
          if (w2) watchers.push(w2);
        }
      } catch { /* subdir may not exist yet */ }
    }
  } catch { /* rootPath may not exist yet */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start watching an entity's artifact directories for changes.
 *
 * On macOS and Windows: a single recursive watcher via { recursive: true }.
 * On Linux and other platforms: individual non-recursive watchers on each
 * directory up to 2 levels deep (covers the full .specify structure).
 *
 * onChange is debounced to 200 ms and called with the entity rootPath.
 *
 * Safe to call multiple times for the same entity — if the entity is already
 * being watched, only NEW directories (e.g. a specs/ that was just created)
 * are added to the existing watch set. This covers the case where the agent
 * creates specs/ after the initial scan (phase badge would not update otherwise).
 */
export function watchEntity(
  entity: SddEntity,
  onChange: (entityRootPath: string) => void,
): void {
  // macOS (FSEvents) and Windows (ReadDirectoryChangesW) support recursive.
  // Linux inotify does NOT — it silently ignores the { recursive } option.
  // We detect the platform and use the manual walk as a fallback.
  //
  // Watch two roots:
  //   1. entity.specifyPath  — .specify/ (constitution.md + legacy specs)
  //   2. {root}/specs/       — modern speckit convention (feature artifacts)
  const specsDir = join(entity.rootPath, 'specs');
  const pathsToWatch = [entity.specifyPath];
  if (existsSync(specsDir)) pathsToWatch.push(specsDir);

  const existing = handles.get(entity.rootPath);
  if (existing) {
    // Entity already watched — only add directories that are newly available
    // (e.g. specs/ was created after the initial watchEntity call).
    const newPaths = pathsToWatch.filter((p) => !existing.watchedPaths.has(p));
    if (newPaths.length === 0) return;

    // Reuse a fresh debouncer for the newly added paths. Multiple independent
    // debounce timers are harmless since watchCb is idempotent.
    const trigger = createDebouncer(onChange, entity.rootPath);
    if (process.platform === 'darwin' || process.platform === 'win32') {
      for (const dir of newPaths) {
        try {
          existing.watchers.push(watch(dir, { recursive: true }, trigger));
          existing.watchedPaths.add(dir);
        } catch { /* dir may have disappeared between existsSync and watch */ }
      }
    } else {
      for (const dir of newPaths) {
        void watchManual(dir, trigger, existing.watchers).then(() => {
          existing.watchedPaths.add(dir);
        });
      }
    }
    return;
  }

  // New entity — set up fresh watchers.
  const trigger = createDebouncer(onChange, entity.rootPath);
  const watchers: FSWatcher[] = [];
  const watchedPaths = new Set<string>();

  if (process.platform === 'darwin' || process.platform === 'win32') {
    for (const dir of pathsToWatch) {
      try {
        watchers.push(watch(dir, { recursive: true }, trigger));
        watchedPaths.add(dir);
      } catch {
        // dir may not exist yet; watchEntity will be called again on the next
        // scan if the directory is created (handled by the update path above).
      }
    }
  } else {
    // Async; individual directory errors are swallowed per-directory.
    // Register the handle immediately (below) to prevent double-registration
    // if watchEntity is called again before the async walk completes.
    for (const dir of pathsToWatch) {
      void watchManual(dir, trigger, watchers).then(() => {
        watchedPaths.add(dir);
      });
    }
  }

  handles.set(entity.rootPath, { watchers, entityRootPath: entity.rootPath, watchedPaths });
}

/** Stop watching a specific entity. */
export function unwatchEntity(entityRootPath: string): void {
  const handle = handles.get(entityRootPath);
  if (handle) {
    for (const w of handle.watchers) w.close();
    handles.delete(entityRootPath);
  }
}

/** Stop all active watchers. */
export function unwatchAll(): void {
  for (const handle of handles.values()) {
    for (const w of handle.watchers) w.close();
  }
  handles.clear();
}
