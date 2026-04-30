// Projects: lightweight grouping for sessions. A project is just a named
// folder + optional defaults. Sessions reference a project via `projectId`;
// `null` means Inbox (the virtual catch-all bucket).
//
// Persisted as a single JSON file at <userData>/projects.json. No nested
// filesystem layout — sessions stay flat on disk.

import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';
import type { PermissionMode } from './settings';

export interface Project {
  id: string;
  name: string;
  /** Absolute, normalized. Used to auto-assign new sessions whose cwd is under it. */
  rootPath: string;
  /** Optional UI hint — hex color for the dot in the sidebar. */
  color?: string;
  /** Override of the global default permission mode. */
  defaultPermissionMode?: PermissionMode;
  defaultConnectionSlug?: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectsFile {
  projects: Project[];
}

const DEFAULTS: ProjectsFile = { projects: [] };

const SCHEMA: FileSchema<ProjectsFile> = {
  path: Paths.projects(),
  currentVersion: 1,
  defaultValue: DEFAULTS,
  migrations: [],
};

function genId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readAll(): Project[] {
  return load(SCHEMA).projects;
}

function writeAll(projects: Project[]): void {
  save(SCHEMA, { projects });
}

export function listProjects(): Project[] {
  return readAll();
}

export function getProject(id: string): Project | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export type ProjectInput = Pick<Project, 'name' | 'rootPath'> &
  Partial<
    Pick<
      Project,
      'color' | 'defaultPermissionMode' | 'defaultConnectionSlug'
    >
  >;

export function createProject(input: ProjectInput): Project {
  const now = Date.now();
  const proj: Project = {
    id: genId(),
    name: input.name.trim() || 'Untitled',
    rootPath: input.rootPath,
    color: input.color,
    defaultPermissionMode: input.defaultPermissionMode,
    defaultConnectionSlug: input.defaultConnectionSlug,
    createdAt: now,
    updatedAt: now,
  };
  const all = readAll();
  all.push(proj);
  writeAll(all);
  return proj;
}

export function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): Project | null {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const merged: Project = {
    ...all[idx],
    ...patch,
    id: all[idx].id,
    createdAt: all[idx].createdAt,
    updatedAt: Date.now(),
  };
  all[idx] = merged;
  writeAll(all);
  return merged;
}

/**
 * Returns true if the project existed and was deleted. The caller is
 * responsible for un-assigning sessions that pointed at this id (we don't
 * import sessions storage here to avoid a cycle).
 */
export function deleteProject(id: string): boolean {
  const all = readAll();
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

/**
 * Longest-prefix match of `cwd` against project rootPaths. Returns the most
 * specific project, so a nested folder picks the deeper rootPath when two
 * projects overlap. `null` if nothing matches (→ Inbox).
 */
export function findProjectForPath(
  cwd: string | undefined,
  projects?: Project[],
): Project | null {
  if (!cwd) return null;
  const list = projects ?? readAll();
  const norm = normalizePath(cwd);
  let best: Project | null = null;
  let bestLen = -1;
  for (const p of list) {
    const root = normalizePath(p.rootPath);
    if (norm === root || norm.startsWith(root + '/')) {
      if (root.length > bestLen) {
        best = p;
        bestLen = root.length;
      }
    }
  }
  return best;
}

function normalizePath(p: string): string {
  // Strip trailing slash; leave the rest untouched. We don't resolve
  // symlinks — the cwd we get from the SDK is what the user picked.
  return p.replace(/\/+$/, '');
}
