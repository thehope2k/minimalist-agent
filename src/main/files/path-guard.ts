// Filesystem access guard for renderer-facing IPC (fs:*/files:*).
//
// The renderer renders untrusted content (LLM output, web_fetch results, file
// contents, diffs). A script that runs there can reach the entire window.api
// surface — so an arbitrary-path read over IPC is a whole-disk exfiltration
// primitive (~/.ssh, credential stores, browser data). This module constrains
// every renderer-initiated read to paths inside a *known* root and resolves
// symlinks first, so a symlink inside a root can't escape it.
//
// Allowed roots = user-chosen project roots + every session's working
// directory. Both are paths the user explicitly opened; nothing else is
// reachable from the renderer.

import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { listProjects } from '../storage/projects';
import { listSessions } from '../storage/sessions';
import { createLogger } from '../logger';

const log = createLogger('path-guard');

// Roots change rarely (new project/session); recomputing on every grep
// keystroke would re-read every session.json from disk. Cache briefly.
const ROOTS_TTL_MS = 5000;
let rootsCache: { roots: string[]; at: number } | null = null;

/** Resolve symlinks + normalize; null if the path doesn't exist / can't resolve. */
function canonicalize(p: string): string | null {
  try {
    return realpathSync.native(resolve(p));
  } catch {
    return null;
  }
}

/** Canonical, deduped set of allowed roots (project roots + session cwds). */
function allowedRoots(): string[] {
  const now = Date.now();
  if (rootsCache && now - rootsCache.at < ROOTS_TTL_MS) {
    return rootsCache.roots;
  }

  const raw = new Set<string>();
  for (const p of listProjects()) {
    if (p.rootPath) raw.add(p.rootPath);
  }
  for (const s of listSessions()) {
    if (s.workingDirectory) raw.add(s.workingDirectory);
  }

  const roots: string[] = [];
  for (const r of raw) {
    const c = canonicalize(r);
    if (c) roots.push(c);
  }

  rootsCache = { roots, at: now };
  return roots;
}

/** Invalidate the roots cache (e.g. after a project/session change). */
export function invalidateAllowedRootsCache(): void {
  rootsCache = null;
}

function isWithin(child: string, parent: string): boolean {
  if (child === parent) return true;
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/**
 * Canonicalize `target` and confirm it resolves inside an allowed root.
 * Returns the canonical (symlink-resolved) path on success, or null if the
 * path is empty, missing, unresolvable, or outside every known root.
 *
 * Symlinks are resolved *before* the boundary check, so a link planted inside
 * a root that points at `/etc/...` is rejected.
 */
export function resolveWithinAllowedRoots(target: string): string | null {
  if (!target) return null;

  const canonical = canonicalize(target);
  if (!canonical) return null;

  for (const root of allowedRoots()) {
    if (isWithin(canonical, root)) return canonical;
  }

  log.warn(`Blocked filesystem access outside allowed roots: ${target}`);
  return null;
}

/** Boolean form of {@link resolveWithinAllowedRoots} for guarding root args. */
export function isWithinAllowedRoots(target: string): boolean {
  return resolveWithinAllowedRoots(target) !== null;
}
