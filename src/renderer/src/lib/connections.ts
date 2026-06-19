// Renderer-side facade over the main-process connections / settings store.

export const DEFAULT_MAX_TURNS = 50;
//
// All persistence lives in `app.getPath('userData')`, accessed via the IPC
// bridge in window.api. We cache loaded values per-process so consumers can
// read synchronously after a one-time bootstrap (`useAiData()` does that).
//
// Mutations always go through here; we update the local cache *and* the file
// on disk, then notify subscribers so the UI re-renders.

import type {
  AiSettings,
  ConnectionMeta,
  Credential,
  PermissionMode,
  ThinkingLevel,
} from './electron';

export type {
  AiSettings,
  ConnectionMeta,
  Credential,
  PermissionMode,
  ThinkingLevel,
};

interface Snapshot {
  connections: ConnectionMeta[];
  defaultSlug?: string;
  settings: AiSettings;
  encryptionAvailable: boolean;
}

const DEFAULT_SETTINGS: AiSettings = { defaultThinking: 'medium' };

let cache: Snapshot | null = null;
let bootPromise: Promise<Snapshot> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

async function load(): Promise<Snapshot> {
  const [connections, defaultSlug, settings, encryptionAvailable] =
    await Promise.all([
      window.api.connections.list(),
      window.api.connections.getDefaultSlug(),
      window.api.settings.get(),
      window.api.connections.isEncryptionAvailable(),
    ]);
  return {
    connections,
    defaultSlug,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    encryptionAvailable,
  };
}

/** Run once at app start. Subsequent calls return the cached snapshot. */
export function bootstrap(): Promise<Snapshot> {
  if (cache) return Promise.resolve(cache);
  if (!bootPromise) {
    bootPromise = load().then((s) => {
      cache = s;
      // Background/manual model-cache refreshes in main push this event;
      // reload so open pickers and settings reflect the new list live.
      window.api.connections.onChanged(() => void reload());
      return s;
    });
  }
  return bootPromise;
}

/** Synchronous read — only safe after `bootstrap()` resolves. */
export function snapshot(): Snapshot {
  if (!cache) {
    throw new Error('Connections store not bootstrapped yet.');
  }
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

export async function saveConnection(
  meta: ConnectionMeta,
  credential: Credential,
): Promise<void> {
  await window.api.connections.save(meta, credential);
  await reload();
}

export async function deleteConnection(slug: string): Promise<void> {
  await window.api.connections.delete(slug);
  await reload();
}

/**
 * Force-refresh a connection's model catalog. On success the main process
 * broadcasts `connections:changed`, which reloads the cache; we also reload
 * defensively so callers can `await` a settled state.
 */
export async function refreshConnectionModels(
  slug: string,
): Promise<
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'unsupported' | 'error'; error?: string }
> {
  const res = await window.api.connections.refreshModels(slug);
  if (res.ok) {
    await reload();
    return { ok: true, changed: res.changed };
  }
  return res;
}

export async function setDefaultConnection(slug: string | undefined): Promise<void> {
  await window.api.connections.setDefaultSlug(slug ?? null);
  await reload();
}

export async function setDefaultModel(modelId: string | undefined): Promise<void> {
  const next = { ...snapshot().settings, defaultModel: modelId };
  await window.api.settings.save(next);
  await reload();
}

export async function setDefaultThinking(level: ThinkingLevel): Promise<void> {
  const next = { ...snapshot().settings, defaultThinking: level };
  await window.api.settings.save(next);
  await reload();
}

export async function setExtendedContext(value: boolean): Promise<void> {
  const next = { ...snapshot().settings, extendedContext: value };
  await window.api.settings.save(next);
  await reload();
}

export async function setMaxTurns(value: number | undefined): Promise<void> {
  const next = { ...snapshot().settings, maxTurns: value };
  await window.api.settings.save(next);
  await reload();
}

export async function setContextFileNames(names: string[]): Promise<void> {
  const next = { ...snapshot().settings, contextFileNames: names };
  await window.api.settings.save(next);
  await reload();
}

export async function setDefaultPermissionMode(
  mode: PermissionMode,
): Promise<void> {
  const next = { ...snapshot().settings, defaultPermissionMode: mode };
  await window.api.settings.save(next);
  await reload();
}

export async function pushRecentFolder(folder: string): Promise<void> {
  const updated = await window.api.settings.pushRecentFolder(folder);
  // Eager cache update — main returns the new settings so we skip a
  // round-trip read and avoid races where subscribers fire before the
  // re-fetched value is in cache.
  if (cache) {
    cache = { ...cache, settings: { ...DEFAULT_SETTINGS, ...updated } };
    notify();
  } else {
    await reload();
  }
}

export async function removeRecentFolder(folder: string): Promise<void> {
  const updated = await window.api.settings.removeRecentFolder(folder);
  if (cache) {
    cache = { ...cache, settings: { ...DEFAULT_SETTINGS, ...updated } };
    notify();
  } else {
    await reload();
  }
}

/** Slug helper — used by Add Connection forms. */
export function generateSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'conn';
  const taken = new Set(cache?.connections.map((c) => c.slug) ?? []);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = `${base}-${i}`;
    if (!taken.has(c)) return c;
  }
  return `${base}-${Date.now()}`;
}
