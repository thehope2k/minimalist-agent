// Encrypted per-extension secrets, mirroring `storage/credentials.ts`.
// Keyed by `<slug>::<keyName>`. The renderer never sees plaintext — it
// only sets/lists/deletes via IPC. Plaintext is decrypted right before
// being passed to the Claude SDK as MCP env values.

import { safeStorage } from 'electron';
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { Paths } from '../storage/paths';

interface SecretsFile {
  version: 1;
  byKey: Record<string, string>;
}

const EMPTY: SecretsFile = { version: 1, byKey: {} };

// In-memory cache — see storage/credentials.ts for the rationale. Each
// decryptString call risks a macOS Keychain prompt; one cached read per
// boot keeps that to a single prompt total.
let cache: SecretsFile | null = null;

function read(): SecretsFile {
  if (cache) return cache;

  const path = Paths.extensionSecrets();
  if (!existsSync(path)) {
    cache = EMPTY;
    return cache;
  }

  const buf = readFileSync(path);
  let json: string;
  if (
    safeStorage.isEncryptionAvailable() &&
    !buf.toString('utf-8').startsWith('{')
  ) {
    json = safeStorage.decryptString(buf);
  } else {
    json = buf.toString('utf-8');
  }
  try {
    const parsed = JSON.parse(json) as SecretsFile;
    if (parsed.version === 1 && parsed.byKey) {
      cache = parsed;
      return cache;
    }
  } catch {
    /* corrupt */
  }
  cache = EMPTY;
  return cache;
}

function write(file: SecretsFile): void {
  const path = Paths.extensionSecrets();
  const json = JSON.stringify(file);
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf-8');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
  cache = file;
}

function fullKey(slug: string, keyName: string): string {
  return `${slug}::${keyName}`;
}

export function getSecret(slug: string, keyName: string): string | null {
  return read().byKey[fullKey(slug, keyName)] ?? null;
}

export function setSecret(slug: string, keyName: string, value: string): void {
  const file = read();
  file.byKey[fullKey(slug, keyName)] = value;
  write(file);
}

export function deleteSecret(slug: string, keyName: string): void {
  const file = read();
  delete file.byKey[fullKey(slug, keyName)];
  if (Object.keys(file.byKey).length === 0) {
    const path = Paths.extensionSecrets();
    if (existsSync(path)) unlinkSync(path);
    cache = EMPTY;
    return;
  }
  write(file);
}

/** Names of secrets currently stored for `slug` (no values). */
export function listSecretKeys(slug: string): string[] {
  const file = read();
  const prefix = `${slug}::`;
  return Object.keys(file.byKey)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .sort();
}

export function isSecretsEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
