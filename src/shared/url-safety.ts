/**
 * Classification of external URLs for `shell.openExternal`-style handlers.
 *
 * Blocklist (not allowlist): the OS only dispatches schemes that have a
 * registered handler, so passing through e.g. `vscode://`, `obsidian://`
 * is safe in practice. Known-dangerous schemes (XSS primitives and `file:`
 * as an RCE vector on Windows where `shell.openExternal` can launch a
 * local executable) stay explicitly blocked with a per-scheme reason so
 * blocked attempts produce a useful toast/log message instead of a generic
 * "Invalid URL".
 *
 * Ported from craft-agents-oss v0.9.6 (`packages/shared/src/utils/url-safety.ts`),
 * minus the `internal-deeplink` branch — MA has no `craftagents://`
 * equivalent today.
 */

export type UrlClassification =
  | { kind: 'dangerous'; scheme?: string; reason: string }
  | { kind: 'safe-external' };

/**
 * Blocked URL schemes (including trailing `:`) mapped to a human-readable
 * reason. The reason flows through to the toast users see when a blocked
 * URL gets clicked, so it should explain *why* not just *what*.
 */
const DANGEROUS_SCHEMES: ReadonlyMap<string, string> = new Map([
  ['javascript:', 'JavaScript URLs can execute arbitrary code in the renderer (XSS vector).'],
  ['data:', 'data: URLs can embed executable content and bypass scheme restrictions.'],
  ['vbscript:', 'VBScript URLs are a legacy script-execution vector.'],
  ['blob:', 'blob: URLs are renderer-scoped and do not resolve outside this window.'],
  [
    'file:',
    'file: URLs are blocked because shell.openExternal can launch local executables on Windows (Electron RCE class). Open the file from your OS file manager instead.',
  ],
]);

export function classifyExternalUrl(rawUrl: string): UrlClassification {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return { kind: 'dangerous', reason: 'URL is empty or whitespace-only.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { kind: 'dangerous', reason: 'URL is malformed and cannot be parsed.' };
  }

  const protocol = parsed.protocol.toLowerCase();
  const blockedReason = DANGEROUS_SCHEMES.get(protocol);
  if (blockedReason) {
    return { kind: 'dangerous', scheme: protocol, reason: blockedReason };
  }

  return { kind: 'safe-external' };
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  return classifyExternalUrl(rawUrl).kind === 'safe-external';
}

/**
 * Format a `dangerous` classification into a user-facing error message.
 * Returns an empty string for non-dangerous classifications.
 */
export function formatBlockedUrlError(classification: UrlClassification): string {
  if (classification.kind !== 'dangerous') return '';
  const suffix = classification.scheme ? ` (${classification.scheme})` : '';
  return `URL blocked${suffix}. ${classification.reason}`;
}
