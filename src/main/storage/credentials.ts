// Encrypted credential vault — secrets keyed by connection slug.
//
// Uses Electron's safeStorage which encrypts with the OS keychain
// (macOS Keychain, Windows DPAPI, libsecret on Linux). Falls back to
// plaintext if safeStorage is unavailable so the app still works in
// CI / unsupported environments.

import { safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
import { Paths } from './paths';

export interface ApiKeyCred { type: 'api_key'; apiKey: string; }
export interface OAuthCred {
  type: 'oauth';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}
export type Credential = ApiKeyCred | OAuthCred;

interface CredentialFile {
  /** Schema version — bump if the wire format changes. */
  version: 1;
  bySlug: Record<string, Credential>;
}

const EMPTY: CredentialFile = { version: 1, bySlug: {} };

// In-memory cache. Each safeStorage.decryptString call triggers a macOS
// Keychain prompt unless the user picked "Always Allow", and read() runs on
// every getCredential — without caching, boot fans out into many prompts.
// Cache is invalidated on every write (same process is the only writer).
let cache: CredentialFile | null = null;

function read(): CredentialFile {
  if (cache) return cache;

  const path = Paths.credentials();
  if (!existsSync(path)) {
    cache = EMPTY;
    return cache;
  }

  const buf = readFileSync(path);
  let json: string;
  if (safeStorage.isEncryptionAvailable() && !buf.toString('utf-8').startsWith('{')) {
    // Encrypted blob.
    json = safeStorage.decryptString(buf);
  } else {
    // Plaintext fallback.
    json = buf.toString('utf-8');
  }

  try {
    const parsed = JSON.parse(json) as CredentialFile;
    if (parsed.version === 1 && parsed.bySlug) {
      cache = parsed;
      return cache;
    }
  } catch {
    /* corrupt — fall through to empty */
  }
  cache = EMPTY;
  return cache;
}

function write(file: CredentialFile): void {
  const path = Paths.credentials();
  const json = JSON.stringify(file);
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf-8');
  const tmp = `${path}.tmp`;
  // Secrets at rest: lock to owner-only. `mode` on create is still masked by
  // umask, so chmod after rename to be deterministic on any host (matters most
  // for the plaintext fallback below, but harmless for the encrypted blob too).
  writeFileSync(tmp, buf, { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
  cache = file;
}

export function getCredential(slug: string): Credential | null {
  return read().bySlug[slug] ?? null;
}

export function setCredential(slug: string, cred: Credential): void {
  const file = read();
  file.bySlug[slug] = cred;
  write(file);
}

export function deleteCredential(slug: string): void {
  const file = read();
  delete file.bySlug[slug];
  if (Object.keys(file.bySlug).length === 0) {
    // Don't leave an empty encrypted blob lying around.
    if (existsSync(Paths.credentials())) unlinkSync(Paths.credentials());
    cache = EMPTY;
    return;
  }
  write(file);
}

/** True only when secrets are encrypted at rest by the OS keychain. */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
