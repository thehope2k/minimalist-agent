import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { Paths, projectConfigRoot } from '../storage/paths';
import { parseExtensionConfig, parseExtensionGuide } from './parse';
import { type ExtensionScope, type LoadedExtension, variantOf } from './types';

const CONFIG_FILE = 'extension.json';
const GUIDE_FILE = 'guide.md';
const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

/** User-tier extensions: ~/.minimalist-agent/extensions/ */
export function getExtensionsDir(): string {
  return Paths.extensionsDir();
}

export function getExtensionDir(slug: string): string {
  return join(getExtensionsDir(), slug);
}

/** Project-tier extensions: <cwd>/.minimalist-agent/extensions/ */
export function getProjectExtensionsDir(cwd: string): string {
  return join(projectConfigRoot(cwd), 'extensions');
}

function findIconFile(extDir: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const candidate = join(extDir, `icon${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
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

// Keyed by cwd ('' = user-only). Same pattern as skills/agents.
const cacheMap = new Map<string, { items: LoadedExtension[]; ts: number }>();
const CACHE_TTL = 5_000;

export function invalidateExtensionsCache(cwd?: string): void {
  if (cwd) {
    cacheMap.delete('');
    cacheMap.delete(cwd);
  } else {
    cacheMap.clear();
  }
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
  const cacheKey = cwd ?? '';
  const now = Date.now();
  const cached = cacheMap.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL) return cached.items;

  const userItems = loadExtensionsFromDirectory(getExtensionsDir(), 'user');
  const projectItems = cwd
    ? loadExtensionsFromDirectory(getProjectExtensionsDir(cwd), 'project')
    : [];

  // Project overrides user for same slug.
  const bySlug = new Map<string, LoadedExtension>();
  for (const ext of userItems) bySlug.set(ext.slug, ext);
  for (const ext of projectItems) bySlug.set(ext.slug, ext);

  const items = Array.from(bySlug.values());
  cacheMap.set(cacheKey, { items, ts: now });
  return items;
}

export function loadExtensionBySlug(slug: string, cwd?: string): LoadedExtension | null {
  if (cwd) {
    const proj = loadExtensionFromDir(slug, getProjectExtensionsDir(cwd), 'project');
    if (proj) return proj;
  }
  return loadExtensionFromDir(slug, getExtensionsDir(), 'user');
}

export function deleteExtension(slug: string): boolean {
  const dir = getExtensionDir(slug);
  if (!existsSync(dir)) return false;
  try {
    rmSync(dir, { recursive: true });
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
  if (!existsSync(dir)) return [];
  const out: ExtensionFileNode[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      out.push({
        kind: 'dir',
        name,
        path: full,
        children: scanExtensionDirectory(full),
      });
    } else if (info.isFile()) {
      out.push({ kind: 'file', name, path: full, size: info.size });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export type { LoadedExtension } from './types';
