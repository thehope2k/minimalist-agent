import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Paths } from '../storage/paths';
import { parseExtensionConfig, parseExtensionGuide } from './parse';
import { type LoadedExtension, variantOf } from './types';

const CONFIG_FILE = 'extension.json';
const GUIDE_FILE = 'guide.md';
const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

export function getExtensionsDir(): string {
  return Paths.extensionsDir();
}

export function getExtensionDir(slug: string): string {
  return join(getExtensionsDir(), slug);
}

function findIconFile(extDir: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const candidate = join(extDir, `icon${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/* ---------- single-extension loader ---------- */

function loadFromDir(slug: string): LoadedExtension | null {
  const extDir = getExtensionDir(slug);
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
    scope: 'global',
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

let cache: { items: LoadedExtension[]; ts: number } | null = null;
const CACHE_TTL = 5_000;

export function invalidateExtensionsCache(): void {
  cache = null;
}

/* ---------- public API ---------- */

export function loadAllExtensions(): LoadedExtension[] {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.items;

  const dir = getExtensionsDir();
  if (!existsSync(dir)) {
    cache = { items: [], ts: now };
    return cache.items;
  }

  const items: LoadedExtension[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    /* ignore */
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const ext = loadFromDir(name);
    if (ext) items.push(ext);
  }
  cache = { items, ts: now };
  return items;
}

export function loadExtensionBySlug(slug: string): LoadedExtension | null {
  return loadFromDir(slug);
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

/**
 * Toggle the `enabled` field in extension.json. Returns the resulting state,
 * or null if the extension didn't exist / wasn't parseable.
 */
export function setExtensionEnabled(
  slug: string,
  enabled: boolean,
): boolean | null {
  const ext = loadExtensionBySlug(slug);
  if (!ext) return null;
  const next = { ...ext.config, enabled };
  try {
    writeFileSync(
      join(ext.path, CONFIG_FILE),
      JSON.stringify(next, null, 2),
      'utf-8',
    );
    invalidateExtensionsCache();
    return enabled;
  } catch {
    return null;
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
