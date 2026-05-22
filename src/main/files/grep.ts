// Full-text / regex search across a local directory tree.
//
// Strategy:
//   1. Try ripgrep (`rg`) — fastest, respects .gitignore automatically via JSON output.
//   2. Fall back to a synchronous Node BFS + readline scan when rg is not on PATH.
//
// The rg binary path is detected once per process lifetime and cached.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ignore from 'ignore';

const execFileAsync = promisify(execFile);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ContentMatchEntry {
  relativePath: string;
  absolutePath: string;
  /** 1-based line number of the match. */
  lineNumber: number;
  /** Full source line with trailing newline stripped. */
  lineContent: string;
  /** Character offset of match start within `lineContent`. */
  matchStart: number;
  /** Character offset of match end (exclusive) within `lineContent`. */
  matchEnd: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Directories always skipped regardless of .gitignore. */
const ALWAYS_IGNORE = new Set([
  '.git', 'node_modules', '.next', '.DS_Store', '.turbo', '.cache',
  '.venv', '__pycache__', 'dist', 'build', '.output', 'coverage', '.nyc_output',
]);

/** Extensions we skip — they won't contain useful text matches. */
const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.br', '.zst', '.7z', '.rar',
  '.mp4', '.mp3', '.wav', '.ogg', '.mov', '.avi', '.mkv', '.webm',
  '.exe', '.dll', '.so', '.dylib', '.node', '.wasm',
  '.db', '.sqlite', '.sqlite3',
]);

/** Skip files bigger than this in the Node fallback (keeps it fast). */
const MAX_FILE_BYTES = 512 * 1024;

/** Cap matches per file so one huge file doesn't flood the results. */
const MAX_PER_FILE = 5;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function grepFiles(args: {
  root: string;
  query: string;
  useRegex?: boolean;
  caseSensitive?: boolean;
  limit?: number;
}): Promise<ContentMatchEntry[]> {
  const { root, query, useRegex = false, caseSensitive = false, limit = 100 } = args;
  if (!root || !query.trim() || !existsSync(root)) return [];

  const rg = await detectRipgrep();
  if (rg) {
    try {
      return await grepWithRipgrep(rg, { root, query, useRegex, caseSensitive, limit });
    } catch {
      // fall through to Node fallback
    }
  }
  return grepWithNode({ root, query, useRegex, caseSensitive, limit });
}

// ─── Ripgrep path ─────────────────────────────────────────────────────────────

/** undefined = not yet detected; null = not available. */
let _rgPath: string | null | undefined;

async function detectRipgrep(): Promise<string | null> {
  if (_rgPath !== undefined) return _rgPath;
  try {
    const { stdout } = await execFileAsync('which', ['rg'], { timeout: 2_000 });
    _rgPath = stdout.trim() || null;
  } catch {
    _rgPath = null;
  }
  return _rgPath;
}

async function grepWithRipgrep(
  rg: string,
  opts: { root: string; query: string; useRegex: boolean; caseSensitive: boolean; limit: number },
): Promise<ContentMatchEntry[]> {
  const { root, query, useRegex, caseSensitive, limit } = opts;

  const args: string[] = [
    '--json',
    '-n',
    '--max-count', String(MAX_PER_FILE),
    '--max-columns', '300',
    '--max-columns-preview',
  ];
  if (!caseSensitive) args.push('-i');
  if (!useRegex)      args.push('-F');     // literal string, not regex
  args.push('--', query, root);

  const { stdout } = await execFileAsync(rg, args, {
    timeout: 15_000,
    maxBuffer: 10 * 1024 * 1024,
  }).catch((e: unknown) => {
    // rg exits with code 1 when there are no matches — that's normal.
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 1) {
      return { stdout: '' };
    }
    throw e;
  });

  return parseRgJson(stdout, root, limit);
}

interface RgMatchLine {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{ match: { text: string }; start: number; end: number }>;
  };
}

function isRgMatch(obj: unknown): obj is RgMatchLine {
  return typeof obj === 'object' && obj !== null &&
    (obj as Record<string, unknown>).type === 'match';
}

function parseRgJson(stdout: string, root: string, limit: number): ContentMatchEntry[] {
  const results: ContentMatchEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (results.length >= limit) break;
    if (!line.trim()) continue;
    let obj: unknown;
    try { obj = JSON.parse(line); } catch { continue; }
    if (!isRgMatch(obj)) continue;

    const { data } = obj;
    const absolutePath = data.path.text;
    const relativePath = relative(root, absolutePath).split(sep).join('/');
    const lineContent  = data.lines.text.replace(/\r?\n$/, '');
    const lineNumber   = data.line_number;
    const sub          = data.submatches[0];
    const matchStart   = sub?.start ?? 0;
    const matchEnd     = sub?.end   ?? matchStart;

    results.push({ relativePath, absolutePath, lineNumber, lineContent, matchStart, matchEnd });
  }
  return results;
}

// ─── Node fallback ────────────────────────────────────────────────────────────

function grepWithNode(opts: {
  root: string;
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  limit: number;
}): ContentMatchEntry[] {
  const { root, query, useRegex, caseSensitive, limit } = opts;

  const ig         = buildIgnore(root);
  const lowerQuery = caseSensitive ? query : query.toLowerCase();
  let re: RegExp | null = null;
  if (useRegex) {
    try { re = new RegExp(query, caseSensitive ? 'g' : 'gi'); } catch { return []; }
  }

  const results: ContentMatchEntry[] = [];
  const queue: string[] = [root];
  let safety = 10_000; // hard cap on dirs visited

  while (queue.length > 0 && results.length < limit && safety-- > 0) {
    const dir = queue.shift()!;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      if (results.length >= limit) break;
      if (ALWAYS_IGNORE.has(entry.name)) continue;

      const abs    = join(dir, entry.name);
      const rel    = relative(root, abs).split(sep).join('/');
      const igKey  = entry.isDirectory() ? rel + '/' : rel;
      if (ig.ignores(igKey)) continue;

      if (entry.isDirectory()) {
        queue.push(abs);
        continue;
      }

      if (BINARY_EXTS.has(extname(entry.name).toLowerCase())) continue;

      try {
        if (statSync(abs).size > MAX_FILE_BYTES) continue;
        const text = readFileSync(abs, 'utf-8');
        scanLines(text, abs, rel, query, lowerQuery, re, caseSensitive, limit, results);
      } catch { continue; }
    }
  }

  return results;
}

function scanLines(
  text: string,
  absolutePath: string,
  relativePath: string,
  query: string,
  lowerQuery: string,
  re: RegExp | null,
  caseSensitive: boolean,
  limit: number,
  out: ContentMatchEntry[],
): void {
  const lines = text.split('\n');
  let fileHits = 0;

  for (let i = 0; i < lines.length && out.length < limit && fileHits < MAX_PER_FILE; i++) {
    const lineContent = lines[i];
    let matchStart = -1;
    let matchEnd   = 0;

    if (re) {
      re.lastIndex = 0;
      const m = re.exec(lineContent);
      if (m) { matchStart = m.index; matchEnd = m.index + m[0].length; }
    } else {
      const hay = caseSensitive ? lineContent : lineContent.toLowerCase();
      const idx = hay.indexOf(lowerQuery);
      if (idx !== -1) { matchStart = idx; matchEnd = idx + query.length; }
    }

    if (matchStart !== -1) {
      out.push({
        relativePath,
        absolutePath,
        lineNumber: i + 1,
        lineContent: lineContent.trimEnd(),
        matchStart,
        matchEnd,
      });
      fileHits++;
    }
  }
}

function buildIgnore(root: string) {
  const ig = ignore();
  const p  = join(root, '.gitignore');
  if (existsSync(p)) {
    try { ig.add(readFileSync(p, 'utf-8')); } catch { /* skip */ }
  }
  return ig;
}
