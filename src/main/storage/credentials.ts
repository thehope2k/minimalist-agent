// Encrypted credential vault — secrets keyed by connection slug. Encryption,
// caching and write ordering live in secure-json-store.ts.

import { Paths } from './paths';
import { createSecureJsonStore } from './secure-json-store';

export interface ApiKeyCred {
  type: 'api_key';
  apiKey: string;
}
export interface OAuthCred {
  type: 'oauth';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}
export interface CodeMieSsoCred {
  type: 'codemie_sso';
  /** Browser session cookies; encrypted at rest in the OS keychain. */
  cookies: Record<string, string>;
  expiresAt?: number;
}
export type Credential = ApiKeyCred | OAuthCred | CodeMieSsoCred;

interface CredentialFile {
  /** Schema version — bump if the wire format changes. */
  version: 1;
  bySlug: Record<string, Credential>;
}

const store = createSecureJsonStore<CredentialFile>({
  name: 'credentials',
  path: Paths.credentials,
  empty: () => ({ version: 1, bySlug: {} }),
  isValid: (v): v is CredentialFile =>
    typeof v === 'object' &&
    v !== null &&
    (v as CredentialFile).version === 1 &&
    !!(v as CredentialFile).bySlug,
  isEmpty: (file) => Object.keys(file.bySlug).length === 0,
});

export async function getCredential(slug: string): Promise<Credential | null> {
  return (await store.load()).bySlug[slug] ?? null;
}

export function setCredential(slug: string, cred: Credential): Promise<void> {
  return store.update((file) => {
    file.bySlug[slug] = cred;
  });
}

export function deleteCredential(slug: string): Promise<void> {
  return store.update((file) => {
    delete file.bySlug[slug];
  });
}

/** True only when secrets are encrypted at rest by the OS keychain. */
export function isEncryptionAvailable(): Promise<boolean> {
  return store.encryptionAvailable();
}

export function flushCredentials(): Promise<void> {
  return store.flush();
}
