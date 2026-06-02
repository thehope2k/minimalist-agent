import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
  type Dirent,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import ignore from 'ignore';

export interface FileTreeNode {
  type: 'file' | 'directory';
  name: string;
  /** Path relative to the root directory */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** File size in bytes (files only) */
  size?: number;
  /** Last modified timestamp (for sorting) */
  mtimeMs: number;
  /** Children array for directories, null for files */
  children: FileTreeNode[] | null;
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
  '.nuxt',
  'dist',
  'build',
  'out',
  '.output',
]);

/**
 * List immediate children of a directory (non-recursive) with gitignore filtering.
 * Returns sorted array: directories first, then files, alphabetically within each group.
 */
export function listDirectory(args: {
  path: string;
  root: string;
  includeHidden?: boolean;
}): FileTreeNode[] {
  const { path: dirPath, root, includeHidden = false } = args;

  if (!dirPath || !existsSync(dirPath)) {
    return [];
  }

  let stat;
  try {
    stat = statSync(dirPath);
  } catch {
    return [];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const ig = loadIgnore(root);
  const entries: Dirent[] = [];

  try {
    entries.push(...readdirSync(dirPath, { withFileTypes: true }));
  } catch {
    // Permission denied or other FS error
    return [];
  }

  const results: FileTreeNode[] = [];

  for (const entry of entries) {
    // Skip hidden files unless explicitly requested
    if (!includeHidden && entry.name.startsWith('.')) {
      continue;
    }

    if (ALWAYS_IGNORE.has(entry.name)) {
      continue;
    }

    const abs = join(dirPath, entry.name);
    const rel = relative(root, abs);
    // `ignore` expects POSIX-style paths
    const relPosix = rel.split(sep).join('/');

    // For directories, append trailing slash so .gitignore patterns
    // that end with `/` (e.g. `dist/`) match correctly
    const ignoreCandidate = entry.isDirectory()
      ? `${relPosix}/`
      : relPosix;
    
    if (ig.ignores(ignoreCandidate)) {
      continue;
    }

    let entrySize: number | undefined;
    let mtimeMs = 0;

    try {
      const entryStat = statSync(abs);
      mtimeMs = entryStat.mtimeMs;
      if (entry.isFile()) {
        entrySize = entryStat.size;
      }
    } catch {
      // Stat failed (symlink loop, permission denied, etc.)
      // Skip this entry
      continue;
    }

    results.push({
      type: entry.isDirectory() ? 'directory' : 'file',
      name: entry.name,
      relativePath: relPosix,
      absolutePath: abs,
      size: entrySize,
      mtimeMs,
      children: entry.isDirectory() ? [] : null,
    });
  }

  // Sort: directories first, then files, alphabetically within each group
  return results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/**
 * Recursively build a full file tree (for initial load).
 * Use with caution on large directories—consider depth limit.
 */
export function buildFileTree(args: {
  path: string;
  root: string;
  includeHidden?: boolean;
  maxDepth?: number;
  currentDepth?: number;
}): FileTreeNode[] {
  const { path: dirPath, root, includeHidden = false, maxDepth = 5, currentDepth = 0 } = args;

  if (currentDepth >= maxDepth) {
    return [];
  }

  const children = listDirectory({ path: dirPath, root, includeHidden });

  // Recursively load children for directories
  return children.map((node) => {
    if (node.type === 'directory') {
      const subChildren = buildFileTree({
        path: node.absolutePath,
        root,
        includeHidden,
        maxDepth,
        currentDepth: currentDepth + 1,
      });
      return { ...node, children: subChildren };
    }
    return node;
  });
}

/** Build an `ignore` matcher from the root `.gitignore` (if present). */
function loadIgnore(root: string) {
  const ig = ignore();
  const path = join(root, '.gitignore');
  if (existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf-8');
      ig.add(content);
    } catch {
      /* ignore read errors — better to over-include than fail */
    }
  }
  return ig;
}
