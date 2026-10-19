import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { listProjects } from '../storage/projects';
import { getSettings, saveSettings } from '../storage/settings';
import { EXCLUDED_DIRECTORIES } from '../agent-runtime/system-prompt/project-context';
import { manifestPath } from './claude-state';

const SCAN_DEPTH = 3;
const SCAN_MAX_DIRS = 5_000;
const ASSET_DIRS = ['skills', 'agents', 'extensions'];

export interface ProjectTarget {
  root: string;
  label: string;
}

function hasAssets(root: string): boolean {
  return ASSET_DIRS.some((dir) => {
    try {
      return readdirSync(join(root, '.minimalist-agent', dir)).some((e) => !e.startsWith('.'));
    } catch {
      return false;
    }
  });
}

/**
 * Project folders with something to sync: MA projects, recent folders, and
 * folders the user added — plus any MA synced to before, so removals still
 * reach them. The home folder is the user tier, never a project.
 */
export function projectTargets(): ProjectTarget[] {
  const projects = listProjects();
  const settings = getSettings();
  const home = resolve(homedir());
  const named = new Map(projects.map((p) => [resolve(p.rootPath), p.name]));
  const roots = [
    ...projects.map((p) => p.rootPath),
    ...(settings.recentFolders ?? []),
    ...(settings.syncFolders ?? []),
  ].map((r) => resolve(r));

  const seen = new Set<string>();
  const targets: ProjectTarget[] = [];
  for (const root of roots) {
    if (seen.has(root) || root === home) continue;
    seen.add(root);
    if (!hasAssets(root) && !existsSync(manifestPath({ kind: 'project', root }))) continue;
    targets.push({ root, label: named.get(root) ?? basename(root) });
  }
  return targets;
}

/** Folders up to three levels under `dir` that have MA project assets. */
export function scanForProjects(dir: string): string[] {
  const found: string[] = [];
  const home = resolve(homedir());
  let visited = 0;
  const queue: Array<[string, number]> = [[resolve(dir), 0]];
  while (queue.length > 0 && visited < SCAN_MAX_DIRS) {
    const [current, depth] = queue.shift()!;
    visited += 1;
    if (current !== home && hasAssets(current)) found.push(current);
    if (depth >= SCAN_DEPTH) continue;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      queue.push([join(current, entry.name), depth + 1]);
    }
  }
  return found;
}

/** Remembers scanned folders so later syncs include them. */
export function addSyncFolders(roots: string[]): void {
  if (roots.length === 0) return;
  const settings = getSettings();
  const next = [...new Set([...(settings.syncFolders ?? []), ...roots])];
  saveSettings({ ...settings, syncFolders: next });
}
