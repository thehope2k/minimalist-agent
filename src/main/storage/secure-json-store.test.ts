import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  available: true,
  shouldReEncrypt: false,
  decryptCalls: 0,
  encryptCalls: 0,
  decryptGate: null as Promise<void> | null,
}));

vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: async () => fake.available,
    encryptStringAsync: async (s: string) => {
      fake.encryptCalls++;
      return Buffer.from(`v10${Buffer.from(s).toString('base64')}`);
    },
    decryptStringAsync: async (b: Buffer) => {
      fake.decryptCalls++;
      if (fake.decryptGate) await fake.decryptGate;
      const raw = b.toString();
      if (!raw.startsWith('v10')) throw new Error('bad blob');
      return {
        result: Buffer.from(raw.slice(3), 'base64').toString(),
        shouldReEncrypt: fake.shouldReEncrypt,
      };
    },
  },
}));
vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { createSecureJsonStore } from './secure-json-store';

interface Doc {
  version: 1;
  items: Record<string, string>;
}

let dir: string;
let path: string;

function makeStore() {
  return createSecureJsonStore<Doc>({
    name: 'items',
    path: () => path,
    empty: () => ({ version: 1, items: {} }),
    isValid: (v): v is Doc =>
      typeof v === 'object' && v !== null && (v as Doc).version === 1 && !!(v as Doc).items,
    isEmpty: (d) => Object.keys(d.items).length === 0,
  });
}

function encryptedBlob(doc: Doc): Buffer {
  return Buffer.from(`v10${Buffer.from(JSON.stringify(doc)).toString('base64')}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'secure-store-'));
  path = join(dir, 'items.enc');
  Object.assign(fake, {
    available: true,
    shouldReEncrypt: false,
    decryptCalls: 0,
    encryptCalls: 0,
    decryptGate: null,
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('createSecureJsonStore', () => {
  it('starts empty when the file is missing', async () => {
    expect(await makeStore().load()).toEqual({ version: 1, items: {} });
  });

  it('round-trips through an encrypted, owner-only file', async () => {
    const store = makeStore();
    await store.update((d) => {
      d.items.a = 'secret';
    });
    const raw = readFileSync(path);
    expect(raw.toString()).not.toContain('secret');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect((await makeStore().load()).items.a).toBe('secret');
  });

  it('reads files written by the old sync encryptString', async () => {
    writeFileSync(path, encryptedBlob({ version: 1, items: { a: 'legacy' } }));
    expect((await makeStore().load()).items.a).toBe('legacy');
  });

  it('decrypts once even with concurrent loads', async () => {
    writeFileSync(path, encryptedBlob({ version: 1, items: { a: '1' } }));
    const store = makeStore();
    await Promise.all([store.load(), store.load(), store.load()]);
    await store.load();
    expect(fake.decryptCalls).toBe(1);
  });

  it('current() throws until loaded, then reads synchronously', async () => {
    writeFileSync(path, encryptedBlob({ version: 1, items: { a: '1' } }));
    const store = makeStore();
    expect(() => store.current()).toThrow(/not loaded/);
    await store.load();
    expect(store.current().items.a).toBe('1');
  });

  it('keeps the last write when updates overlap', async () => {
    const store = makeStore();
    await Promise.all([
      store.update((d) => {
        d.items.a = '1';
      }),
      store.update((d) => {
        d.items.b = '2';
      }),
      store.update((d) => {
        delete d.items.a;
      }),
    ]);
    expect((await makeStore().load()).items).toEqual({ b: '2' });
  });

  it('flush() waits for an update that is still loading', async () => {
    writeFileSync(path, encryptedBlob({ version: 1, items: { a: '1' } }));
    let release!: () => void;
    fake.decryptGate = new Promise((r) => (release = r));
    const store = makeStore();
    const pending = store.update((d) => {
      d.items.b = '2';
    });
    let flushed = false;
    const flush = store.flush().then(() => (flushed = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(flushed).toBe(false);
    release();
    await Promise.all([pending, flush]);
    fake.decryptGate = null;
    expect((await makeStore().load()).items).toEqual({ a: '1', b: '2' });
  });

  it('deletes the file once the store is empty', async () => {
    const store = makeStore();
    await store.update((d) => {
      d.items.a = '1';
    });
    await store.update((d) => {
      delete d.items.a;
    });
    expect(existsSync(path)).toBe(false);
  });

  it('never overwrites an encrypted file it cannot decrypt', async () => {
    const blob = encryptedBlob({ version: 1, items: { a: 'keep' } });
    writeFileSync(path, blob);
    fake.available = false;
    const store = makeStore();
    await expect(store.update((d) => void (d.items.b = 'x'))).rejects.toThrow(/unavailable/);
    expect(readFileSync(path).equals(blob)).toBe(true);
  });

  it('retries a failed load on the next call', async () => {
    writeFileSync(path, encryptedBlob({ version: 1, items: { a: '1' } }));
    fake.available = false;
    const store = makeStore();
    await expect(store.load()).rejects.toThrow();
    fake.available = true;
    expect((await store.load()).items.a).toBe('1');
  });

  it('encrypts a legacy plaintext file once encryption is available', async () => {
    writeFileSync(path, JSON.stringify({ version: 1, items: { a: 'plain' } }));
    const store = makeStore();
    expect((await store.load()).items.a).toBe('plain');
    await store.flush();
    expect(readFileSync(path).toString()).not.toContain('plain');
    expect((await makeStore().load()).items.a).toBe('plain');
  });

  it('re-encrypts when safeStorage asks for it', async () => {
    writeFileSync(path, encryptedBlob({ version: 1, items: { a: '1' } }));
    fake.shouldReEncrypt = true;
    const store = makeStore();
    await store.load();
    await store.flush();
    expect(fake.encryptCalls).toBe(1);
    expect((await makeStore().load()).items.a).toBe('1');
  });

  it('falls back to plaintext when encryption is unavailable', async () => {
    fake.available = false;
    await makeStore().update((d) => {
      d.items.a = '1';
    });
    expect(JSON.parse(readFileSync(path, 'utf-8')).items.a).toBe('1');
  });

  it('starts empty on a corrupt file', async () => {
    writeFileSync(path, '{not json');
    expect((await makeStore().load()).items).toEqual({});
  });
});
