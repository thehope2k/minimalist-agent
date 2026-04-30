import {existsSync, readdirSync, readFileSync, rmSync, statSync,} from 'node:fs';
import {basename, join} from 'node:path';
import type {LoadedSkill} from './types';
import {parseSkillFile} from './parse';
import {Paths} from '../storage/paths';

/**
 * Skills directory — lives under the app's `userData` root, alongside
 * sessions/connections/credentials. Same convention as every other
 * persistent piece of state in the app.
 */
export function getSkillsDir(): string {
  return Paths.skillsDir();
}


/* ---------- icon discovery ---------- */

const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

/** Find the first `icon.{ext}` file in a skill directory, if any. */
function findIconFile(skillDir: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const candidate = join(skillDir, `icon${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/* ---------- single-skill loader ---------- */

function loadSkillFromDir(slug: string): LoadedSkill | null {
  const skillDir = join(getSkillsDir(), slug);
  const skillFile = join(skillDir, 'SKILL.md');

  try {
    if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) return null;
  } catch {
    return null;
  }
  if (!existsSync(skillFile)) return null;

  let content: string;
  try {
    content = readFileSync(skillFile, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseSkillFile(content);
  if (!parsed) return null;

  return {
    slug,
    metadata: parsed.metadata,
    content: parsed.body,
    iconPath: findIconFile(skillDir),
    path: skillDir,
    source: 'global',
  };
}

/* ---------- cache ---------- */

let cache: { skills: LoadedSkill[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60_000;

/** Drop the cache. Call on file events / settings changes. */
export function invalidateSkillsCache(): void {
  cache = null;
}

/* ---------- public API ---------- */

/** Load every skill under `~/.agents/skills/`. Cached for `CACHE_TTL`. */
export function loadAllSkills(): LoadedSkill[] {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.skills;

  if (!existsSync(getSkillsDir())) {
    cache = { skills: [], ts: now };
    return cache.skills;
  }

  const skills: LoadedSkill[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(getSkillsDir());
  } catch {
    /* ignore */
  }
  for (const name of entries) {
    const skill = loadSkillFromDir(name);
    if (skill) skills.push(skill);
  }
  cache = { skills, ts: now };
  return skills;
}

/** O(1) lookup by slug. */
export function loadSkillBySlug(slug: string): LoadedSkill | null {
  return loadSkillFromDir(slug);
}

/** Delete a skill directory. Returns true if it existed and was removed. */
export function deleteSkill(slug: string): boolean {
  const skillDir = join(getSkillsDir(), slug);
  if (!existsSync(skillDir)) return false;
  try {
    rmSync(skillDir, { recursive: true });
    invalidateSkillsCache();
    return true;
  } catch {
    return false;
  }
}

/* ---------- file tree (for SkillInfoPage) ---------- */

export type SkillFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: SkillFileNode[] };

/** Recursively scan a skill directory for the info-page file tree view. */
export function scanSkillDirectory(dir: string): SkillFileNode[] {
  if (!existsSync(dir)) return [];
  const out: SkillFileNode[] = [];
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
        children: scanSkillDirectory(full),
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

/* ---------- icon download ---------- */
export type { LoadedSkill, SkillSource } from './types';
export { basename };
