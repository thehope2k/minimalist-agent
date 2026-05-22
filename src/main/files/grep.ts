// Full-text / regex search using the bundled ripgrep binary.
//
// @vscode/ripgrep ships platform-specific prebuilt binaries — no system
// dependency required. electron-builder.yml's asarUnpack extracts the
// binary so it can be executed in the packaged app.
//
// No Node fallback: if rg can't run, we return [] rather than blocking
// the main process with synchronous fs scans over thousands of files.

import { execFile }     from 'node:child_process';
import { promisify }    from 'node:util';
import { existsSync }   from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app }          from 'electron';

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Binary path ──────────────────────────────────────────────────────────────

/**
 * Resolve the bundled rg binary at module load.
 *
 * Packaged app: binary is in app.asar.unpacked/ (asarUnpack in electron-builder.yml)
 *   Resources/
 *     app.asar            ← virtual archive
 *     app.asar.unpacked/
 *       node_modules/@vscode/ripgrep-<platform>-<arch>/bin/rg
 *
 * Dev (electron-vite): binary is in project node_modules, installed by npm
 *   project/
 *     node_modules/@vscode/ripgrep-<platform>-<arch>/bin/rg
 *     out/main/index.js   ← this file (import.meta.url)
 */
function resolveRgPath(): string {
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const pkgDir     = `ripgrep-${process.platform}-${process.arch}`;

  if (app.isPackaged) {
    // dirname(app.getAppPath()) = .../Contents/Resources/
    return join(dirname(app.getAppPath()), 'app.asar.unpacked',
      'node_modules', '@vscode', pkgDir, 'bin', binaryName);
  }

  // Dev: import.meta.url = file:///.../out/main/index.js
  //      ../../ lands on the project root.
  const outMainDir = fileURLToPath(new URL('.', import.meta.url));
  return join(outMainDir, '../..', 'node_modules', '@vscode', pkgDir, 'bin', binaryName);
}

const RG_PATH = resolveRgPath();

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

  const rgArgs: string[] = [
    '--json',
    '-n',
    '--max-count',        '5',   // cap per file — avoids flooding from big files
    '--max-columns',      '300',
    '--max-columns-preview',
  ];
  if (!caseSensitive) rgArgs.push('-i');
  if (!useRegex)      rgArgs.push('-F'); // fixed string, not regex
  rgArgs.push('--', query, root);

  const { stdout } = await execFileAsync(RG_PATH, rgArgs, {
    timeout: 15_000,
    maxBuffer: 10 * 1024 * 1024,
  }).catch((e: unknown) => {
    // rg exits with code 1 when there are zero matches — that's normal.
    if (typeof e === 'object' && e !== null && 'code' in e &&
        (e as { code: unknown }).code === 1) {
      return { stdout: '' };
    }
    // Any other error (binary missing, permissions, …) → empty results.
    return { stdout: '' };
  });

  return parseRgJson(stdout, root, limit);
}

// ─── rg JSON parser ───────────────────────────────────────────────────────────

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

    const { data }     = obj;
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
