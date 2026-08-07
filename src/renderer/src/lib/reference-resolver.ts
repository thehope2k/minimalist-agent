/**
 * Resolves a path-like reference (a `file://` link, or a plain absolute/
 * relative path from a tool call) to a concrete open action, using the
 * `files:stat` IPC probe so the decision is based on what's actually on
 * disk rather than guessing from the string alone.
 *
 * Kept renderer-only and pure aside from the single `window.api.files.stat`
 * call, so it can be reused from markdown links, tool-call chips, and any
 * future surface without duplicating path/extension logic.
 */

import type { FileStatResult } from './electron';

const NON_PREVIEWABLE_EXTS = new Set([
  'pdf', 'zip', 'gz', 'tar', 'dmg', 'exe', 'bin',
  'mp3', 'mp4', 'mov', 'wav', 'sqlite', 'db',
]);

export interface ReferenceActions {
  openFile: (absolutePath: string, lineNumber?: number) => void;
  revealInFinder: (absolutePath: string) => void;
}

export type ReferenceOutcome =
  | { ok: true; action: 'opened' | 'revealed'; absolutePath: string }
  | { ok: false; reason: string };

const WIN32_ABSOLUTE_PATH_RE = /^[a-zA-Z]:[\\/]|^\\\\/;

function isAbsolutePath(rawPath: string): boolean {
  return rawPath.startsWith('/') || WIN32_ABSOLUTE_PATH_RE.test(rawPath);
}

/** Strips a `file://` URL down to its filesystem path; null if not that scheme. */
export function fileUrlToPath(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'file:') return null;
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

/** Joins a relative path against `cwd`; absolute paths (POSIX or Windows) and missing cwd pass through unchanged. */
export function resolveAgainstCwd(rawPath: string, cwd: string | undefined): string {
  if (isAbsolutePath(rawPath) || !cwd) return rawPath;
  // Windows accepts `/` as a separator interchangeably with `\`, so this
  // stays a plain forward-slash join even when `cwd` looks like `C:\...` —
  // correctness-not-urgent per review, since this app's supported platforms
  // use POSIX-style session/project roots today.
  return `${cwd.replace(/[\\/]$/, '')}/${rawPath}`;
}

function extOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Given a raw path or `file://` URL, resolve it against `cwd` (for relative
 * paths), confirm it exists via `files:stat` (confined to allowed roots on
 * the main-process side), and dispatch the appropriate action:
 *   - directory       → reveal in Finder/Explorer
 *   - previewable file → open in the in-app viewer
 *   - binary/pdf/etc.  → reveal in Finder/Explorer (viewer can't render it)
 *   - missing/outside allowed roots → no action, caller shows feedback
 */
export async function openReference(
  rawPathOrFileUrl: string,
  cwd: string | undefined,
  actions: ReferenceActions,
): Promise<ReferenceOutcome> {
  const asFileUrl = fileUrlToPath(rawPathOrFileUrl);
  const candidate = resolveAgainstCwd(asFileUrl ?? rawPathOrFileUrl, cwd);

  const stat: FileStatResult = await window.api.files.stat(candidate);

  if (stat.kind === 'unavailable') {
    return { ok: false, reason: 'File not found, or outside the current project.' };
  }
  if (stat.kind === 'dir') {
    actions.revealInFinder(stat.absolutePath);
    return { ok: true, action: 'revealed', absolutePath: stat.absolutePath };
  }
  if (NON_PREVIEWABLE_EXTS.has(extOf(stat.absolutePath))) {
    actions.revealInFinder(stat.absolutePath);
    return { ok: true, action: 'revealed', absolutePath: stat.absolutePath };
  }
  actions.openFile(stat.absolutePath);
  return { ok: true, action: 'opened', absolutePath: stat.absolutePath };
}

/**
 * Same confinement as {@link openReference} but always reveals (never opens
 * the in-app viewer) — used by the standalone "Reveal in Finder" menu item.
 * Stats first for a fast, accurate outcome/feedback message; sessions:revealFile
 * itself also validates server-side, so this is defense-in-depth, not the
 * only gate.
 */
export async function revealInFinder(
  rawPathOrFileUrl: string,
  cwd: string | undefined,
  reveal: (absolutePath: string) => void,
): Promise<ReferenceOutcome> {
  const asFileUrl = fileUrlToPath(rawPathOrFileUrl);
  const candidate = resolveAgainstCwd(asFileUrl ?? rawPathOrFileUrl, cwd);

  const stat: FileStatResult = await window.api.files.stat(candidate);
  if (stat.kind === 'unavailable') {
    return { ok: false, reason: 'File not found, or outside the current project.' };
  }
  reveal(stat.absolutePath);
  return { ok: true, action: 'revealed', absolutePath: stat.absolutePath };
}
