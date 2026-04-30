// Renderer-side cache + subscription layer over the main-process projects
// store. Mirrors the pattern used by `connections.ts` and `sessions.ts`.

import type { Project, ProjectInput } from './electron';
import { reload as reloadSessions } from './sessions';

let cache: Project[] | null = null;
let bootPromise: Promise<Project[]> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

async function load(): Promise<Project[]> {
  return window.api.projects.list();
}

export function bootstrap(): Promise<Project[]> {
  if (cache) return Promise.resolve(cache);
  if (!bootPromise) {
    bootPromise = load().then((p) => {
      cache = p;
      return p;
    });
  }
  return bootPromise;
}

export function snapshot(): Project[] {
  if (!cache) throw new Error('Projects store not bootstrapped yet.');
  return cache;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

async function reload(): Promise<void> {
  cache = await load();
  notify();
}

/* ---------- mutations ---------- */

export async function createProject(input: ProjectInput): Promise<Project> {
  const proj = await window.api.projects.create(input);
  await reload();
  return proj;
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): Promise<Project | null> {
  const proj = await window.api.projects.update(id, patch);
  await reload();
  return proj;
}

export async function deleteProject(
  id: string,
): Promise<{ ok: boolean; sessionsCleared: number }> {
  const result = await window.api.projects.delete(id);
  await reload();
  // Sessions whose projectId matched were reset to Inbox in main; refresh
  // the renderer cache so the sidebar reflects that immediately.
  if (result.sessionsCleared > 0) {
    void reloadSessions();
  }
  return result;
}

/* ---------- helpers ---------- */

export function findProject(id: string | null | undefined): Project | null {
  if (!id || !cache) return null;
  return cache.find((p) => p.id === id) ?? null;
}
