import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirrors the base read's path resolution, which pi doesn't export, so a PDF is
// found under exactly the name the base read would open: unicode spaces, leading
// "@", Git Bash/MSYS/Cygwin/WSL drive paths on Windows, "~", file:// URLs, then
// look-alike names (macOS screenshot AM/PM spacing, NFD, curly apostrophes).
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = '\u202F';
const RIGHT_SINGLE_QUOTE = '\u2019';
const IS_WINDOWS = process.platform === 'win32';
const SHELL_DRIVE_PATH = /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i;

export async function resolveExistingPath(
  requested: string,
  cwd: string,
): Promise<string | undefined> {
  for (const candidate of lookAlikeCandidates(resolveRequestedPath(requested, cwd))) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

function resolveRequestedPath(requested: string, cwd: string): string {
  const spaced = requested.replace(UNICODE_SPACES, ' ');
  const withoutAt = spaced.startsWith('@') ? spaced.slice(1) : spaced;
  const native = IS_WINDOWS ? fromWindowsShellPath(withoutAt) : withoutAt;
  const expanded = expandHome(native);
  const local = expanded.startsWith('file://') ? fileURLToPath(expanded) : expanded;
  return isAbsolute(local) ? resolve(local) : resolve(cwd, local);
}

/** "/c/Users/x", "/mnt/c/Users/x" or "/cygdrive/c/Users/x" → "C:\\Users\\x". */
export function fromWindowsShellPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return path;
  const match = SHELL_DRIVE_PATH.exec(path);
  if (!match) return path;
  const rest = match[2]?.replaceAll('/', '\\') ?? '';
  return `${match[1].toUpperCase()}:\\${rest}`;
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  const homeRelative = path.startsWith('~/') || (IS_WINDOWS && path.startsWith('~\\'));
  return homeRelative ? join(homedir(), path.slice(2)) : path;
}

function lookAlikeCandidates(resolved: string): string[] {
  const nfd = resolved.normalize('NFD');
  return [
    resolved,
    resolved.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`),
    nfd,
    withCurlyQuotes(resolved),
    withCurlyQuotes(nfd),
  ];
}

function withCurlyQuotes(path: string): string {
  return path.replace(/'/g, RIGHT_SINGLE_QUOTE);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
