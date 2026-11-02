// Encrypted per-extension secrets, mirroring `storage/credentials.ts`.
// Keyed by `<slug>::<keyName>`. The renderer never sees plaintext — it
// only sets/lists/deletes via IPC. Plaintext is decrypted right before
// being passed to the agent subprocess as MCP env values.
//
// Reads are synchronous because setup status and env resolution are; entry
// points that reach them must `await loadExtensionSecrets()` first.

import { createLogger } from '../logger';
import { Paths } from '../storage/paths';
import { createSecureJsonStore } from '../storage/secure-json-store';

const log = createLogger('extension-secrets');

interface SecretsFile {
  version: 1;
  byKey: Record<string, string>;
}

const store = createSecureJsonStore<SecretsFile>({
  name: 'extension secrets',
  path: Paths.extensionSecrets,
  empty: () => ({ version: 1, byKey: {} }),
  isValid: (v): v is SecretsFile =>
    typeof v === 'object' &&
    v !== null &&
    (v as SecretsFile).version === 1 &&
    !!(v as SecretsFile).byKey,
  isEmpty: (file) => Object.keys(file.byKey).length === 0,
});

// Set while the file can't be decrypted (Keychain prompt dismissed, no keyring
// on Linux). Reads then see no secrets, so the extensions that need them show
// as missing setup instead of blocking chat; writes still go through the store,
// which refuses to overwrite a file it couldn't read.
let unavailable = false;

function fullKey(slug: string, keyName: string): string {
  return `${slug}::${keyName}`;
}

function secrets(): Record<string, string> {
  return unavailable ? {} : store.current().byKey;
}

/** Never throws; a failed load is retried on the next call. */
export async function loadExtensionSecrets(): Promise<void> {
  try {
    await store.load();
    unavailable = false;
  } catch (err) {
    if (!unavailable) log.warn('extension secrets unavailable; treating as unset:', err);
    unavailable = true;
  }
}

export function getSecret(slug: string, keyName: string): string | null {
  return secrets()[fullKey(slug, keyName)] ?? null;
}

// A write only succeeds once the store has loaded, which also ends the degraded state.
function write(mutate: (file: SecretsFile) => void): Promise<void> {
  return store.update(mutate).then(() => {
    unavailable = false;
  });
}

export function setSecret(slug: string, keyName: string, value: string): Promise<void> {
  return write((file) => {
    file.byKey[fullKey(slug, keyName)] = value;
  });
}

export function deleteSecret(slug: string, keyName: string): Promise<void> {
  return write((file) => {
    delete file.byKey[fullKey(slug, keyName)];
  });
}

/** Names of secrets currently stored for `slug` (no values). */
export function listSecretKeys(slug: string): string[] {
  const prefix = `${slug}::`;
  return Object.keys(secrets())
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .sort();
}

export function isSecretsEncryptionAvailable(): Promise<boolean> {
  return store.encryptionAvailable();
}

export function flushExtensionSecrets(): Promise<void> {
  return store.flush();
}
