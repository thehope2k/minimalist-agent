import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Paths, projectConfigRoot } from '../storage/paths';
import { parseExtensionConfig, parseExtensionGuide } from './parse';
import { type ExtensionScope, type LoadedExtension, variantOf } from './types';
import { findIconFile } from '../asset-tiers/icon';
import { createTwoTierCache, mergeTiers } from '../asset-tiers/two-tier-cache';
import { scanAssetDirectory } from '../asset-tiers/file-tree';

const CONFIG_FILE = 'extension.json';
const GUIDE_FILE = 'guide.md';

/** User-tier extensions: ~/.minimalist-agent/extensions/ */
export function getExtensionsDir(): string {
  return Paths.extensionsDir();
}

/** Project-tier extensions: <cwd>/.minimalist-agent/extensions/ */
export function getProjectExtensionsDir(cwd: string): string {
  return join(projectConfigRoot(cwd), 'extensions');
}

/* ---------- single-extension loader ---------- */

function loadExtensionFromDir(slug: string, dir: string, scope: ExtensionScope): LoadedExtension | null {
  const extDir = join(dir, slug);
  const configPath = join(extDir, CONFIG_FILE);
  const guidePath = join(extDir, GUIDE_FILE);

  try {
    if (!existsSync(extDir) || !statSync(extDir).isDirectory()) return null;
  } catch {
    return null;
  }
  if (!existsSync(configPath) || !existsSync(guidePath)) return null;

  let configRaw: string;
  let guideRaw: string;
  try {
    configRaw = readFileSync(configPath, 'utf-8');
    guideRaw = readFileSync(guidePath, 'utf-8');
  } catch {
    return null;
  }

  const config = parseExtensionConfig(configRaw);
  if (!config) return null;
  const guide = parseExtensionGuide(guideRaw);
  if (!guide) return null;

  return {
    slug,
    scope,
    path: extDir,
    config,
    guideFrontmatter: guide.frontmatter,
    guideBody: guide.body,
    iconPath: findIconFile(extDir),
    variant: variantOf(config),
    guidePath,
  };
}

/* ---------- cache ---------- */

// Same pattern as skills/agents, via the shared two-tier cache helper.
const cache = createTwoTierCache<LoadedExtension>(5_000);

export function invalidateExtensionsCache(cwd?: string): void {
  cache.invalidate(cwd);
}

/* ---------- directory-level loader ---------- */

function loadExtensionsFromDirectory(
  dir: string,
  scope: ExtensionScope,
): LoadedExtension[] {
  if (!existsSync(dir)) return [];
  const items: LoadedExtension[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const ext = loadExtensionFromDir(name, dir, scope);
    if (ext) items.push(ext);
  }
  return items;
}

/* ---------- public API ---------- */

/**
 * Load all extensions merged from all available tiers:
 *   - user tier:    ~/.minimalist-agent/extensions/
 *   - project tier: <cwd>/.minimalist-agent/extensions/  (when cwd provided)
 *
 * Project-tier extensions take precedence over user-tier for same slug.
 * Project-tier extensions are always active (presence = enabled).
 * Cached per unique (user + cwd) combination.
 */
export function loadAllExtensions(cwd?: string): LoadedExtension[] {
  const cached = cache.get(cwd);
  if (cached) return cached;

  const userItems = loadExtensionsFromDirectory(getExtensionsDir(), 'user');
  const projectItems = cwd
    ? loadExtensionsFromDirectory(getProjectExtensionsDir(cwd), 'project')
    : [];

  const items = mergeTiers(userItems, projectItems);
  cache.set(cwd, items);
  return items;
}

export function loadExtensionBySlug(slug: string, cwd?: string): LoadedExtension | null {
  if (cwd) {
    const proj = loadExtensionFromDir(slug, getProjectExtensionsDir(cwd), 'project');
    if (proj) return proj;
  }
  return loadExtensionFromDir(slug, getExtensionsDir(), 'user');
}

export function deleteExtension(dirPath: string): boolean {
  if (basename(dirname(dirPath)) !== 'extensions') return false;
  if (!existsSync(dirPath)) return false;
  try {
    rmSync(dirPath, { recursive: true });
    invalidateExtensionsCache();
    return true;
  } catch {
    return false;
  }
}

/* ---------- file tree (for ExtensionInfoPage later) ---------- */

export type ExtensionFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: ExtensionFileNode[] };

export function scanExtensionDirectory(dir: string): ExtensionFileNode[] {
  return scanAssetDirectory(dir);
}

export type { LoadedExtension } from './types';
