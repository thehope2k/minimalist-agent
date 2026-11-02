// Encrypted-at-rest JSON file on Electron's async safeStorage (the sync API is
// deprecated in Electron 45 and removed in 46). Uses the OS keychain (macOS
// Keychain, Windows DPAPI, libsecret on Linux) and falls back to plaintext when
// encryption is unavailable so the app still works in CI / unsupported hosts.
//
// The file is decrypted once, lazily, and then served from memory: each decrypt
// can raise a macOS Keychain prompt, and the async decrypt keeps that prompt from
// freezing the main process the way the sync one did. Writes are serialized and
// always persist the latest in-memory state.

import { safeStorage } from 'electron';
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createLogger } from '../logger';

const log = createLogger('secure-store');

export interface SecureJsonStoreOptions<T> {
  /** Human name for logs and errors, e.g. "credentials". */
  name: string;
  path: () => string;
  empty: () => T;
  isValid: (value: unknown) => value is T;
  /** Empty stores delete their file rather than leave an encrypted blob behind. */
  isEmpty: (value: T) => boolean;
}

export interface SecureJsonStore<T> {
  /** Decrypts the file on first call; later calls resolve from memory. */
  load(): Promise<T>;
  /** Synchronous read for code that cannot await; throws until `load()` has resolved. */
  current(): T;
  /** Mutates the loaded data in place and resolves once it is on disk. */
  update(mutate: (data: T) => void): Promise<void>;
  /** Resolves when every queued write has settled. */
  flush(): Promise<void>;
  encryptionAvailable(): Promise<boolean>;
}

// Legacy plaintext-fallback files are raw JSON; os_crypt blobs start with a "v1x" prefix.
function isPlaintextJson(buf: Buffer): boolean {
  return buf.toString('utf-8').startsWith('{');
}

export function createSecureJsonStore<T>(opts: SecureJsonStoreOptions<T>): SecureJsonStore<T> {
  let data: T | null = null;
  let loading: Promise<T> | null = null;
  let writes: Promise<void> = Promise.resolve();
  let warnedPlaintext = false;

  async function readFromDisk(): Promise<{ value: T; reEncrypt: boolean }> {
    const path = opts.path();
    if (!existsSync(path)) return { value: opts.empty(), reEncrypt: false };

    const buf = readFileSync(path);
    const available = await safeStorage.isAsyncEncryptionAvailable();
    let json: string;
    let reEncrypt: boolean;
    if (isPlaintextJson(buf)) {
      json = buf.toString('utf-8');
      reEncrypt = available;
    } else if (!available) {
      // Refuse rather than treat the blob as empty: the next write would destroy it.
      throw new Error(`${opts.name} are encrypted but OS encryption is unavailable`);
    } else {
      const decrypted = await safeStorage.decryptStringAsync(buf);
      json = decrypted.result;
      reEncrypt = decrypted.shouldReEncrypt;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = undefined;
    }
    if (!opts.isValid(parsed)) {
      log.warn(`${opts.name} file is unreadable; starting empty`);
      return { value: opts.empty(), reEncrypt: false };
    }
    return { value: parsed, reEncrypt };
  }

  async function writeToDisk(): Promise<void> {
    if (data === null) return;
    const path = opts.path();
    if (opts.isEmpty(data)) {
      rmSync(path, { force: true });
      return;
    }
    const json = JSON.stringify(data);
    let buf: Buffer;
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      buf = await safeStorage.encryptStringAsync(json);
    } else {
      if (!warnedPlaintext) {
        warnedPlaintext = true;
        log.warn(`OS encryption unavailable; ${opts.name} are stored as plaintext`);
      }
      buf = Buffer.from(json, 'utf-8');
    }
    const tmp = `${path}.tmp`;
    // Owner-only at rest. The create `mode` is masked by umask, so chmod after
    // rename to be deterministic (matters most for the plaintext fallback).
    writeFileSync(tmp, buf, { mode: 0o600 });
    renameSync(tmp, path);
    chmodSync(path, 0o600);
  }

  function persist(): Promise<void> {
    const run = writes.then(writeToDisk);
    writes = run.catch(() => {});
    return run;
  }

  function load(): Promise<T> {
    if (data !== null) return Promise.resolve(data);
    // A failed load is not cached, so the next caller retries (e.g. after the
    // user answers a Keychain prompt they first dismissed).
    loading ??= readFromDisk()
      .then(({ value, reEncrypt }) => {
        data = value;
        if (reEncrypt) {
          persist().catch((err) => log.warn(`re-encrypting ${opts.name} failed:`, err));
        }
        return value;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  return {
    load,
    current() {
      if (data !== null) return data;
      load().catch((err) => log.error(`loading ${opts.name} failed:`, err));
      throw new Error(`${opts.name} are not loaded yet`);
    },
    update(mutate) {
      // Joins the queue before loading so flush() covers it, and mutations apply in call order.
      const run = writes.then(async () => {
        mutate(await load());
        await writeToDisk();
      });
      writes = run.catch(() => {});
      return run;
    },
    flush: () => writes,
    encryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  };
}
