import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { LoadedSkill } from './types';
import { parseSkillFile } from './parse';
import { Paths, projectConfigRoot } from '../storage/paths';
import { findIconFile } from '../asset-tiers/icon';
import { createTwoTierCache, mergeTiers } from '../asset-tiers/two-tier-cache';
import { scanAssetDirectory } from '../asset-tiers/file-tree';

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

const cache = createTwoTierCache<LoadedSkill>(5 * 60_000);

/** Drop the cache for a specific cwd (or all entries). Call on file events / settings changes. */
export function invalidateSkillsCache(cwd?: string): void {
  cache.invalidate(cwd);
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
  const cached = cache.get(cwd);
  if (cached) return cached;

  const userSkills = loadSkillsFromDirectory(getSkillsDir(), 'user');
  const projectSkills = cwd
    ? loadSkillsFromDirectory(getProjectSkillsDir(cwd), 'project')
    : [];

  const skills = mergeTiers(userSkills, projectSkills);
  cache.set(cwd, skills);
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
  return scanAssetDirectory(dir);
}

export type { LoadedSkill, SkillSource } from './types';
export { basename };
