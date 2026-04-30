// Renderer-side cache + subscription layer for extensions. Mirrors lib/skills.ts.

import type { ExtensionFileNode, LoadedExtension } from './electron';

export type { ExtensionFileNode, LoadedExtension };

let cache: LoadedExtension[] | null = null;
let bootPromise: Promise<LoadedExtension[]> | null = null;
let dirCache: string | null = null;
let dirPromise: Promise<string> | null = null;
const subscribers = new Set<() => void>();

export function getExtensionsDir(): Promise<string> {
  if (dirCache) return Promise.resolve(dirCache);
  if (!dirPromise) {
    dirPromise = window.api.extensions.getDir().then((d) => {
      dirCache = d;
      dirPromise = null;
      return d;
    });
  }
  return dirPromise;
}

let refDocCache: string | null = null;
let refDocPromise: Promise<string> | null = null;

export function getExtensionsReferenceDocPath(): Promise<string> {
  if (refDocCache) return Promise.resolve(refDocCache);
  if (!refDocPromise) {
    refDocPromise = window.api.extensions.getReferenceDocPath().then((p) => {
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

async function load(): Promise<LoadedExtension[]> {
  return window.api.extensions.list();
}

export function bootstrap(): Promise<LoadedExtension[]> {
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

export function snapshot(): LoadedExtension[] {
  if (!cache) throw new Error('Extensions store not bootstrapped yet.');
  return cache;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function reload(): Promise<void> {
  await window.api.extensions.invalidateCache();
  cache = await load();
  notify();
}

/* ---------- mutations ---------- */

export async function deleteExtension(slug: string): Promise<boolean> {
  const ok = await window.api.extensions.delete(slug);
  if (ok) await reload();
  return ok;
}

export async function setEnabled(
  slug: string,
  enabled: boolean,
): Promise<boolean | null> {
  const result = await window.api.extensions.setEnabled(slug, enabled);
  if (result !== null) await reload();
  return result;
}

export function listFiles(dirPath: string): Promise<ExtensionFileNode[]> {
  return window.api.extensions.listFiles(dirPath);
}

export function openInEditor(dirPath: string): Promise<string> {
  return window.api.extensions.openInEditor(dirPath);
}

export function revealInFinder(dirPath: string): Promise<void> {
  return window.api.extensions.revealInFinder(dirPath);
}

export function validate(
  dirPath: string,
  slug: string,
): Promise<{ ok: boolean; report: string }> {
  return window.api.extensions.validate(dirPath, slug);
}

/* ---------- display helpers ---------- */

export function displayName(ext: LoadedExtension): string {
  return ext.guideFrontmatter.name || ext.config.name;
}

export function displayDescription(ext: LoadedExtension): string {
  return ext.guideFrontmatter.description || ext.config.description;
}

export function displayIcon(ext: LoadedExtension): string | undefined {
  return ext.guideFrontmatter.icon || ext.config.icon;
}

export function isEnabled(ext: LoadedExtension): boolean {
  return ext.config.enabled !== false;
}
