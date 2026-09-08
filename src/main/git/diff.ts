// Produces the two text strings (original vs modified) that Monaco's
// DiffEditor needs to render a file diff.
//
// Strategy per file status:
//   M / R  — HEAD content vs current disk content
//   A / ?  — empty string vs current disk content   (new / untracked)
//   D      — HEAD content vs empty string           (deleted)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { extname, basename } from 'node:path';

const execFileAsync = promisify(execFile);

export interface GitFileDiff {
  original: string;
  modified: string;
  /** Monaco language id derived from file extension. */
  language: string;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.html': 'html', '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json', '.jsonc': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'ini',
  '.md': 'markdown', '.mdx': 'markdown',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.xml': 'xml', '.svg': 'xml',
  '.sql': 'sql',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.proto': 'proto',
  '.tf': 'hcl',
};

function detectLanguage(relativePath: string): string {
  const name = basename(relativePath).toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const ext = extname(relativePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? 'plaintext';
}

async function getRefContent(repoRoot: string, ref: string, relativePath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoRoot, 'show', `${ref}:${relativePath}`],
    { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
}

async function getHeadContent(repoRoot: string, relativePath: string): Promise<string> {
  return getRefContent(repoRoot, 'HEAD', relativePath);
}

function readDiskContent(absolutePath: string): string {
  if (!existsSync(absolutePath)) return '';
  const buf = readFileSync(absolutePath);

  // Binary file detection: null byte in the first 8KB is a reliable heuristic.
  const scanLen = Math.min(buf.length, 8_000);
  for (let i = 0; i < scanLen; i++) {
    if (buf[i] === 0) return '\0BINARY';
  }

  return buf.toString('utf-8');
}

export async function getFileDiff(
  repoRoot: string,
  relativePath: string,
  absolutePath: string,
  status: string,
): Promise<GitFileDiff> {
  const language = detectLanguage(relativePath);
  let original = '';
  let modified = '';

  if (status === '?' || status === 'A') {
    // New / untracked — no HEAD version.
    modified = readDiskContent(absolutePath);
  } else if (status === 'D') {
    // Deleted — nothing on disk.
    original = await getHeadContent(repoRoot, relativePath).catch(() => '');
  } else {
    // M or R — compare HEAD vs disk.
    [original, modified] = await Promise.all([
      getHeadContent(repoRoot, relativePath).catch(() => ''),
      Promise.resolve(readDiskContent(absolutePath)),
    ]);
  }

  if (original === '\0BINARY' || modified === '\0BINARY') {
    return {
      original: '(binary file — diff not available)',
      modified: '(binary file — diff not available)',
      language: 'plaintext',
    };
  }

  return { original, modified, language };
}

/**
 * Diff for a single file as it changed in HEAD (the commit being amended),
 * i.e. HEAD^:path vs HEAD:path — read-only, unrelated to the working tree.
 */
export async function getCommitFileDiff(
  repoRoot: string,
  relativePath: string,
  oldPath: string | undefined,
  status: string,
): Promise<GitFileDiff> {
  const language = detectLanguage(relativePath);
  let original = '';
  let modified = '';

  if (status === 'A') {
    modified = await getRefContent(repoRoot, 'HEAD', relativePath).catch(() => '');
  } else if (status === 'D') {
    original = await getRefContent(repoRoot, 'HEAD^', oldPath ?? relativePath).catch(() => '');
  } else {
    [original, modified] = await Promise.all([
      getRefContent(repoRoot, 'HEAD^', oldPath ?? relativePath).catch(() => ''),
      getRefContent(repoRoot, 'HEAD', relativePath).catch(() => ''),
    ]);
  }

  if (original.includes('\0') || modified.includes('\0')) {
    return {
      original: '(binary file — diff not available)',
      modified: '(binary file — diff not available)',
      language: 'plaintext',
    };
  }

  return { original, modified, language };
}
