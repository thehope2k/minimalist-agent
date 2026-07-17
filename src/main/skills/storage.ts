import {existsSync, readdirSync, readFileSync, rmSync, statSync,} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import type {LoadedSkill} from './types';
import {parseSkillFile} from './parse';
import {Paths, projectConfigRoot} from '../storage/paths';

/**
 * User-tier skills directory: ~/.minimalist-agent/skills/
 * Portable, versionable. Managed from the Skills settings panel.
 */
export function getSkillsDir(): string {
  return Paths.skillsDir();
}

/**
 * Project-tier skills directory: <cwd>/.minimalist-agent/skills/
 * Git-committable, team-shareable. Not managed from the UI.
 */
export function getProjectSkillsDir(cwd: string): string {
  return join(projectConfigRoot(cwd), 'skills');
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

function loadSkillFromDir(slug: string, dir: string, source: import('./types').SkillSource): LoadedSkill | null {
  const skillDir = join(dir, slug);
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
    source,
  };
}

/* ---------- cache ---------- */

// Keyed by canonical cache key: '' for user-only, cwd string when project included.
const cacheMap = new Map<string, { skills: LoadedSkill[]; ts: number }>();
const CACHE_TTL = 5 * 60_000;

/** Drop the cache for a specific cwd (or all entries). Call on file events / settings changes. */
export function invalidateSkillsCache(cwd?: string): void {
  if (cwd) {
    cacheMap.delete('');
    cacheMap.delete(cwd);
  } else {
    cacheMap.clear();
  }
}

/* ---------- directory-level loader ---------- */

function loadSkillsFromDirectory(
  dir: string,
  source: import('./types').SkillSource,
): LoadedSkill[] {
  if (!existsSync(dir)) return [];
  const skills: LoadedSkill[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const skill = loadSkillFromDir(name, dir, source);
    if (skill) skills.push(skill);
  }
  return skills;
}

/* ---------- public API ---------- */

/**
 * Load all skills merged from all available tiers:
 *   - user tier:    ~/.minimalist-agent/skills/
 *   - project tier: <cwd>/.minimalist-agent/skills/  (when cwd is provided)
 *
 * Project-tier skills take precedence over user-tier for same slug.
 * Cached per unique (user + cwd) combination with a 5-minute TTL.
 */
export function loadAllSkills(cwd?: string): LoadedSkill[] {
  const cacheKey = cwd ?? '';
  const now = Date.now();
  const cached = cacheMap.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL) return cached.skills;

  const userSkills = loadSkillsFromDirectory(getSkillsDir(), 'user');
  const projectSkills = cwd
    ? loadSkillsFromDirectory(getProjectSkillsDir(cwd), 'project')
    : [];

  // Merge: project overrides user for same slug (project wins).
  const bySlug = new Map<string, LoadedSkill>();
  for (const s of userSkills) bySlug.set(s.slug, s);
  for (const s of projectSkills) bySlug.set(s.slug, s); // project overrides

  const skills = Array.from(bySlug.values());
  cacheMap.set(cacheKey, { skills, ts: now });
  return skills;
}

/** O(1) lookup by slug, checking project tier first then user tier. */
export function loadSkillBySlug(slug: string, cwd?: string): LoadedSkill | null {
  // Project tier takes precedence.
  if (cwd) {
    const proj = loadSkillFromDir(slug, getProjectSkillsDir(cwd), 'project');
    if (proj) return proj;
  }
  return loadSkillFromDir(slug, getSkillsDir(), 'user');
}

/** Delete a skill directory. Returns true if it existed and was removed. */
export function deleteSkill(dirPath: string): boolean {
  if (basename(dirname(dirPath)) !== 'skills') return false;
  if (!existsSync(dirPath)) return false;
  try {
    rmSync(dirPath, { recursive: true });
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
