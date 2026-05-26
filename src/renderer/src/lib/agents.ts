import type { LoadedAgent, AgentFileNode } from './electron';

export type { LoadedAgent, AgentFileNode };

let cache: LoadedAgent[] | null = null;
let bootPromise: Promise<LoadedAgent[]> | null = null;
let dirCache: string | null = null;
let dirPromise: Promise<string> | null = null;
let refDocCache: string | null = null;
let refDocPromise: Promise<string> | null = null;
const subscribers = new Set<() => void>();

export function getAgentsDir(): Promise<string> {
  if (dirCache) return Promise.resolve(dirCache);
  if (!dirPromise) {
    dirPromise = window.api.agents.getDir().then((d) => {
      dirCache = d;
      dirPromise = null;
      return d;
    });
  }
  return dirPromise;
}

/** Resolve and cache the path to the bundled agents reference doc. */
export function getAgentsReferenceDocPath(): Promise<string> {
  if (refDocCache) return Promise.resolve(refDocCache);
  if (!refDocPromise) {
    refDocPromise = window.api.agents.getReferenceDocPath().then((p) => {
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

async function load(): Promise<LoadedAgent[]> {
  return window.api.agents.list();
}

export function bootstrap(): Promise<LoadedAgent[]> {
  if (cache) return Promise.resolve(cache);
  if (!bootPromise) {
    bootPromise = load().then((a) => {
      cache = a;
      bootPromise = null;
      return a;
    });
  }
  return bootPromise;
}

export function snapshot(): LoadedAgent[] {
  if (!cache) throw new Error('Agents store not bootstrapped yet.');
  return cache;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function reload(): Promise<void> {
  await window.api.agents.invalidateCache();
  cache = await load();
  notify();
}

export async function deleteAgent(slug: string): Promise<boolean> {
  const ok = await window.api.agents.delete(slug);
  if (ok) await reload();
  return ok;
}

export function listFiles(dirPath: string): Promise<AgentFileNode[]> {
  return window.api.agents.listFiles(dirPath);
}

export function openInEditor(dirPath: string): Promise<string> {
  return window.api.agents.openInEditor(dirPath);
}

export function revealInFinder(dirPath: string): Promise<void> {
  return window.api.agents.revealInFinder(dirPath);
}

export function validate(
  dirPath: string,
  slug: string,
): Promise<{ ok: boolean; report: string }> {
  return window.api.agents.validate(dirPath, slug);
}
