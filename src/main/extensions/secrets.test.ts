import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ available: true, path: '' }));

vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: async () => fake.available,
    encryptStringAsync: async (s: string) => Buffer.from(`v10${Buffer.from(s).toString('base64')}`),
    decryptStringAsync: async (b: Buffer) => ({
      result: Buffer.from(b.toString().slice(3), 'base64').toString(),
      shouldReEncrypt: false,
    }),
  },
}));
vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../storage/paths', () => ({ Paths: { extensionSecrets: () => fake.path } }));

let dir: string;
const blob = Buffer.from(
  `v10${Buffer.from(JSON.stringify({ version: 1, byKey: { 'ext::TOKEN': 's3cret' } })).toString('base64')}`,
);

beforeEach(() => {
  vi.resetModules();
  dir = mkdtempSync(join(tmpdir(), 'ext-secrets-'));
  fake.path = join(dir, 'extension-secrets.enc');
  fake.available = true;
  writeFileSync(fake.path, blob);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('extension secrets', () => {
  it('reads synchronously once loaded', async () => {
    const secrets = await import('./secrets');
    await secrets.loadExtensionSecrets();
    expect(secrets.getSecret('ext', 'TOKEN')).toBe('s3cret');
    expect(secrets.listSecretKeys('ext')).toEqual(['TOKEN']);
  });

  it('treats undecryptable secrets as unset without throwing, and never overwrites them', async () => {
    fake.available = false;
    const secrets = await import('./secrets');
    await expect(secrets.loadExtensionSecrets()).resolves.toBeUndefined();
    expect(secrets.getSecret('ext', 'TOKEN')).toBeNull();
    expect(secrets.listSecretKeys('ext')).toEqual([]);
    await expect(secrets.setSecret('ext', 'OTHER', 'x')).rejects.toThrow();
    expect(readFileSync(fake.path).equals(blob)).toBe(true);
  });

  it('recovers once the keychain becomes available', async () => {
    fake.available = false;
    const secrets = await import('./secrets');
    await secrets.loadExtensionSecrets();
    fake.available = true;
    await secrets.loadExtensionSecrets();
    expect(secrets.getSecret('ext', 'TOKEN')).toBe('s3cret');
  });
});
