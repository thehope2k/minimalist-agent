import type { Dirent } from 'node:fs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { getSettings, DEFAULT_CONTEXT_FILE_NAMES } from '../../storage/settings';

/** Maximum number of context files to discover in monorepo. */
const MAX_CONTEXT_FILES = 30;

/** Maximum directory depth when walking for context files. */
const MAX_WALK_DEPTH = 3;

/**
 * Directories to exclude when searching for context files.
 * These are common build output, dependency, and cache directories.
 */
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  '.cache',
  '.turbo',
  'out',
  '.output',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'target',
  '.gradle',
]);

// ── Context file cache ──────────────────────────────────────────────────
// The recursive walk is expensive in large monorepos. The result (a list of
// file paths like "CLAUDE.md", "apps/electron/CLAUDE.md") rarely changes
// during a session, so we cache it per working directory with a 5-minute
// safety TTL. Explicit invalidation happens on working directory changes.

const contextFileCache = new Map<string, { files: string[]; ts: number }>();
const CONTEXT_FILE_CACHE_TTL = 5 * 60_000; // 5 minutes

/** Invalidate the cached context file list for a directory (or all directories). */
export function invalidateContextFileCache(directory?: string): void {
  if (directory) contextFileCache.delete(directory);
  else contextFileCache.clear();
}

/**
 * Recursive walker that respects EXCLUDED_DIRECTORIES, caps depth, and is
 * case-insensitive for the trailing filename. Returns paths relative to
 * `root`, sorted by depth then alphabetically. Capped at MAX_CONTEXT_FILES.
 *
 * (Equivalent to `globSync('**\u200b/{agents,claude}.md', { nocase: true, ignore: \u2026 })`
 * — implemented with `fs.readdirSync({ withFileTypes: true })` so we don't
 * need to add a `glob` dependency.)
 */
function walkForContextFiles(root: string): string[] {
  const configuredNames = getSettings().contextFileNames ?? DEFAULT_CONTEXT_FILE_NAMES;
  const fileSet = new Set(configuredNames.map((n) => n.toLowerCase()));
  const matches: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (matches.length >= MAX_CONTEXT_FILES) return;
    if (depth > MAX_WALK_DEPTH) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (fileSet.has(e.name.toLowerCase())) {
        const abs = join(dir, e.name);
        const rel =
          abs === join(root, e.name)
            ? e.name
            : abs.startsWith(root + sep)
              ? abs.slice(root.length + 1)
              : abs;
        matches.push(rel);
        if (matches.length >= MAX_CONTEXT_FILES) return;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (EXCLUDED_DIRECTORIES.has(e.name)) continue;
      visit(join(dir, e.name), depth + 1);
    }
  };
  visit(root, 0);
  return matches;
}

/**
 * Find all project context files (AGENTS.md or CLAUDE.md) recursively in a directory.
 * Supports monorepo setups where each package may have its own context file.
 * Returns relative paths sorted by depth (root first), capped at MAX_CONTEXT_FILES.
 *
 * Results are cached per directory. Call invalidateContextFileCache() on working
 * directory changes. A 5-minute TTL acts as a safety net for cache staleness.
 */
export function findAllProjectContextFiles(directory: string): string[] {
  if (!directory) return [];
  try {
    if (!statSync(directory).isDirectory()) return [];
  } catch {
    return [];
  }

  // Check cache first
  const now = Date.now();
  const cached = contextFileCache.get(directory);
  if (cached && now - cached.ts < CONTEXT_FILE_CACHE_TTL) {
    return cached.files;
  }

  try {
    const matches = walkForContextFiles(directory);

    if (matches.length === 0) {
      contextFileCache.set(directory, { files: [], ts: now });
      return [];
    }

    // Sort by depth (fewer slashes = shallower = higher priority), then alphabetically.
    // Root files come first, then nested packages.
    const sorted = matches.sort((a, b) => {
      const depthA = (a.match(/\//g) || []).length;
      const depthB = (b.match(/\//g) || []).length;
      if (depthA !== depthB) return depthA - depthB;
      return a.localeCompare(b);
    });

    // Cap at max files to avoid overwhelming the prompt.
    const capped = sorted.slice(0, MAX_CONTEXT_FILES);

    contextFileCache.set(directory, { files: capped, ts: now });
    return capped;
  } catch {
    return [];
  }
}

/**
 * Get the project context files prompt section for the system prompt.
 * Lists all discovered context files (AGENTS.md, CLAUDE.md) in the working directory.
 * For monorepos, this includes nested package context files.
 * Returns empty string if no working directory or no context files found.
 */
export function getProjectContextFilesPrompt(workingDirectory?: string): string {
  if (!workingDirectory) return '';

  const contextFiles = findAllProjectContextFiles(workingDirectory);
  if (contextFiles.length === 0) return '';

  const isRoot = (f: string) => !f.includes('/') && !f.includes(sep);
  const rootFiles = contextFiles.filter(isRoot);
  const subFiles = contextFiles.filter((f) => !isRoot(f));

  const parts: string[] = [];

  // Eagerly inject root-level context file content directly into the system prompt
  for (const file of rootFiles) {
    try {
      const content = readFileSync(join(workingDirectory, file), 'utf8');
      parts.push(
        `<project_context>\n\nProject-specific instructions and guidelines:\n\n` +
          `<project_instructions path="${join(workingDirectory, file)}">\n${content}\n</project_instructions>\n\n</project_context>`,
      );
    } catch {
      // File disappeared between discovery and read — fall back to pointer.
      parts.push(
        `<project_context_files working_directory="${workingDirectory}">\n- ${file} (root)\n</project_context_files>`,
      );
    }
  }

  // Sub-package context files are listed as pointers — the model reads them
  // on demand when working in those areas of a monorepo.
  if (subFiles.length > 0) {
    const fileList = subFiles.map((f) => `- ${f}`).join('\n');
    parts.push(
      `<project_context_files working_directory="${workingDirectory}">\n${fileList}\n</project_context_files>`,
    );
  }

  return parts.join('\n\n');
}
