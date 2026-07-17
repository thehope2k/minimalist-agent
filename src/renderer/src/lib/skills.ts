// Renderer-side cache + subscription layer over the main-process skills
// store. Mirrors the pattern in `connections.ts` / `sessions.ts`:
// snapshot reads are sync after a one-time bootstrap; mutations refresh
// the cache.

import type { LoadedSkill } from './electron';

export type { LoadedSkill };

let cache: LoadedSkill[] | null = null;
let bootPromise: Promise<LoadedSkill[]> | null = null;
let dirCache: string | null = null;
let dirPromise: Promise<string> | null = null;
const subscribers = new Set<() => void>();

/**
 * Resolve the skills directory path once and cache it. Used by the
 * AddSkillDialog to show users where their SKILL.md will land.
 */
export function getSkillsDir(): Promise<string> {
  if (dirCache) return Promise.resolve(dirCache);
  if (!dirPromise) {
    dirPromise = window.api.skills.getDir().then((d) => {
      dirCache = d;
      dirPromise = null;
      return d;
    });
  }
  return dirPromise;
}

/** Resolve the project-tier skills directory for the given cwd. Never cached — cwd can change. */
export function getProjectSkillsDir(cwd: string): Promise<string> {
  return window.api.skills.getProjectDir(cwd);
}

let refDocCache: string | null = null;
let refDocPromise: Promise<string> | null = null;

/** Resolve and cache the path to the bundled skills reference doc. */
export function getSkillsReferenceDocPath(): Promise<string> {
  if (refDocCache) return Promise.resolve(refDocCache);
  if (!refDocPromise) {
    refDocPromise = window.api.skills.getReferenceDocPath().then((p) => {
      refDocCache = p;
      refDocPromise = null;
      return p;
    });
  }
  return refDocPromise;
}

function notify(): void {
  subscribers.forEach((cb) => cb());
}

async function load(): Promise<LoadedSkill[]> {
  return window.api.skills.list();
}

export function bootstrap(): Promise<LoadedSkill[]> {
  if (cache) return Promise.resolve(cache);
  if (!bootPromise) {
    bootPromise = load().then((s) => {
      cache = s;
      bootPromise = null;
      return s;
    });
  }
  return bootPromise;
}

export function snapshot(): LoadedSkill[] {
  if (!cache) throw new Error('Skills store not bootstrapped yet.');
  return cache;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function reload(): Promise<void> {
  await window.api.skills.invalidateCache();
  cache = await load();
  notify();
}

/* ---------- mutations ---------- */

export async function deleteSkill(dirPath: string): Promise<boolean> {
  const ok = await window.api.skills.delete(dirPath);
  if (ok) await reload();
  return ok;
}

export function openInEditor(dirPath: string): Promise<string> {
  return window.api.skills.openInEditor(dirPath);
}

export function revealInFinder(dirPath: string): Promise<void> {
  return window.api.skills.revealInFinder(dirPath);
}

export function validate(
  dirPath: string,
  slug: string,
): Promise<{ ok: boolean; report: string }> {
  return window.api.skills.validate(dirPath, slug);
}
