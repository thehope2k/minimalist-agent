import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
  type Dirent,
} from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import ignore from 'ignore';

export interface FileSearchEntry {
  /** 'file' or 'directory' — drives the icon in the picker. */
  type: 'file' | 'directory';
  /** Display name (basename). */
  name: string;
  /** Path relative to the search root — what we put into `[file:…]`. */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Last-modified timestamp (ms). Used for ranking. */
  mtimeMs: number;
}

/** Always ignored, regardless of `.gitignore`. */
const ALWAYS_IGNORE = new Set([
  '.git',
  '.DS_Store',
  'node_modules',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  '__pycache__',
]);

const DEFAULT_LIMIT = 50;

/**
 * Search files + directories under `root` matching `query`. Empty `query`
 * returns the most-recently-modified entries (useful as a "browse" mode
 * before the user types anything).
 */
export function searchFiles(args: {
  root: string;
  query: string;
  limit?: number;
}): FileSearchEntry[] {
  const { root, query } = args;
  const limit = args.limit ?? DEFAULT_LIMIT;
  if (!root || !existsSync(root)) return [];

  const ig = loadIgnore(root);
  const lowerQuery = query.trim().toLowerCase();
  const out: FileSearchEntry[] = [];

  // Iterative BFS — a flat queue so we don't blow the stack on deep trees.
  const queue: string[] = [root];
  let safety = 50_000; // hard cap on dirs visited to bound runtime

  while (queue.length > 0 && out.length < limit && safety > 0) {
    const dir = queue.shift()!;
    safety--;

    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (out.length >= limit) break;
      if (ALWAYS_IGNORE.has(entry.name)) continue;

      const abs = join(dir, entry.name);
      const rel = relative(root, abs);
      // `ignore` expects POSIX-style paths.
      const relPosix = rel.split(sep).join('/');

      // For directories, append a trailing slash so .gitignore patterns
      // that end with `/` (e.g. `dist/`) match correctly.
      const ignoreCandidate = entry.isDirectory()
        ? `${relPosix}/`
        : relPosix;
      if (ig.ignores(ignoreCandidate)) continue;

      let mtimeMs = 0;
      try {
        mtimeMs = statSync(abs).mtimeMs;
      } catch {
        /* keep 0 */
      }

      const matchesQuery =
        !lowerQuery ||
        entry.name.toLowerCase().includes(lowerQuery) ||
        relPosix.toLowerCase().includes(lowerQuery);

      if (matchesQuery) {
        out.push({
          type: entry.isDirectory() ? 'directory' : 'file',
          name: entry.name,
          relativePath: relPosix,
          absolutePath: abs,
          mtimeMs,
        });
      }

      if (entry.isDirectory()) {
        queue.push(abs);
      }
    }
  }

  return rankResults(out);
}

/** Build an `ignore` matcher from the root `.gitignore` (if present). */
function loadIgnore(root: string) {
  const ig = ignore();
  const path = join(root, '.gitignore');
  if (existsSync(path)) {
    try {
      ig.add(readFileSync(path, 'utf-8'));
    } catch {
      /* ignore read errors — better to over-include than fail */
    }
  }
  return ig;
}

/**
 * Sort: directories first (people more often jump-to-folder than to a
 * specific file), then mtime DESC, then alphabetical for stability.
 */
function rankResults(entries: FileSearchEntry[]): FileSearchEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
    return a.name.localeCompare(b.name);
  });
}

export { basename };
