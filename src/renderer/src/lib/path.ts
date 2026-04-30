// Tiny helper because the renderer can't `import { homedir } from 'node:os'`.
// The preload bridge exposes the value synchronously on `window.env.homedir`,
// so we read it once and cache. Falls back to '' in environments without the
// preload (e.g. tests) — callers should treat that as "unknown".

let cached: string | null = null;

export function homedir(): string {
  if (cached !== null) return cached;
  cached =
    (typeof window !== 'undefined' && window.env?.homedir) || '';
  return cached;
}
