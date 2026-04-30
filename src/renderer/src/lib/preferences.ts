// Renderer-side facade over the main-process preferences store.
//
// Mirrors the shape of `lib/connections.ts`: bootstrap once, cache in
// memory, expose synchronous read + subscribe for reactivity, mutations
// round-trip through IPC and reload.

import type { UserPreferences } from './electron';

export type { UserPreferences };

let cache: UserPreferences | null = null;
let bootPromise: Promise<UserPreferences> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

async function load(): Promise<UserPreferences> {
  return window.api.preferences.get();
}

export function bootstrapPreferences(): Promise<UserPreferences> {
  if (cache) return Promise.resolve(cache);
  if (!bootPromise) {
    bootPromise = load().then((p) => {
      cache = p;
      return p;
    });
  }
  return bootPromise;
}

export function preferencesSnapshot(): UserPreferences {
  if (!cache) throw new Error('Preferences store not bootstrapped yet.');
  return cache;
}

export function subscribePreferences(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

async function reload(): Promise<void> {
  cache = await load();
  notify();
}

export async function updatePreferences(
  patch: Partial<UserPreferences>,
): Promise<void> {
  const current = cache ?? (await load());
  const next: UserPreferences = {
    ...current,
    ...patch,
    location: patch.location
      ? { ...current.location, ...patch.location }
      : current.location,
  };
  await window.api.preferences.save(next);
  await reload();
}
