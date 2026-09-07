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

/**
 * Session cwd is a much shorter, more useful display anchor than the home
 * directory — `src/main/pi-server/index.ts` vs. `~/Workspaces/minimalist-
 * agent/minimalist-agent/src/main/pi-server/index.ts`. That repeated
 * repo-root boilerplate is what was eating the visible width and hiding
 * the actually-differentiating tail before both the JS `clip()`
 * (tool-summary.ts) and CSS `truncate` (diff chips) truncations kick in.
 */
export function relativeToCwd(absPath: string, cwd: string | undefined): string {
  const normalizedCwd = cwd?.replace(/\/+$/, '');
  if (normalizedCwd) {
    if (absPath === normalizedCwd) return '.';
    if (absPath.startsWith(normalizedCwd + '/')) {
      return absPath.slice(normalizedCwd.length + 1).replace(/\/+/g, '/');
    }
  }
  return absPath.replace(/^\/Users\/[^/]+\//, '~/');
}
