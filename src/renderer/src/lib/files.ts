// Renderer-side wrapper around the main-process file search. Debounces
// keystrokes (150 ms) and caches the *first* result set per `(root, '')`
// so subsequent keystrokes filter client-side without a round trip.
//
// We deliberately keep this stateless across the React tree — the
// MentionMenu owns its own `files` state and uses these helpers as plain
// async functions.

import type { FileSearchEntry } from './electron';

export type { FileSearchEntry };

const DEFAULT_LIMIT = 50;

/** Empty-query result cache, keyed by root. */
const browseCache = new Map<string, FileSearchEntry[]>();

/**
 * Run the search via IPC. Empty `query` returns the recent-files list and
 * caches it so subsequent same-root opens are instant.
 */
export async function searchFiles(
  root: string,
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<FileSearchEntry[]> {
  if (!root) return [];
  const trimmed = query.trim();
  if (!trimmed) {
    const cached = browseCache.get(root);
    if (cached) return cached;
    const res = await window.api.files.search({ root, query: '', limit });
    browseCache.set(root, res);
    return res;
  }
  return window.api.files.search({ root, query: trimmed, limit });
}

/** Drop the cached browse list — call when the cwd changes. */
export function clearFileBrowseCache(root?: string): void {
  if (root) browseCache.delete(root);
  else browseCache.clear();
}

/* ---------- ranking helpers (used by MentionMenu) ---------- */

/**
 * Score a single entry against the query. Higher = better.
 *   3 — name starts with query
 *   2 — name includes query (substring)
 *   1 — subsequence match (chars in order, not contiguous)
 *   0 — no match
 */
export function scoreEntry(entry: FileSearchEntry, query: string): number {
  if (!query) return 1;
  const name = entry.name.toLowerCase();
  const path = entry.relativePath.toLowerCase();
  const q = query.toLowerCase();
  if (name.startsWith(q)) return 3;
  if (name.includes(q) || path.includes(q)) return 2;
  if (subsequenceMatch(name, q) || subsequenceMatch(path, q)) return 1;
  return 0;
}

function subsequenceMatch(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}
