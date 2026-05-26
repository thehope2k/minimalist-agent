// Connections file — non-secret metadata only. Secrets live in credentials.enc.
//
// Schema v1 shape:
//   {
//     version: 1,
//     data: {
//       defaultSlug?: string,
//       connections: ConnectionMeta[]
//     }
//   }

import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';
import {
  type Credential,
  deleteCredential,
  getCredential,
  setCredential,
} from './credentials';

export type ProviderType = 'anthropic' | 'pi' | 'local';
export type AuthType = 'api_key' | 'oauth';
import type { PiAuthProvider } from '../../shared/pi-types';
export type { PiAuthProvider };

export interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
  supportsVision?: boolean;
  supportsToolCalls?: boolean;
  supportsStreaming?: boolean;
  category?: 'powerful' | 'versatile' | 'lightweight';
  recommendedFor?: string[];
}

/** Metadata persisted on disk — secrets are NOT in here. */
export interface ConnectionMeta {
  slug: string;
  name: string;
  providerType: ProviderType;
  authType: AuthType;
  /** Required when providerType === 'pi'; identifies which sub-provider. */
  piAuthProvider?: PiAuthProvider;
  /** Required when providerType === 'local'; base URL of the local model server. */
  baseUrl?: string;
  defaultModel: string;
  models: ModelDef[];
  createdAt: number;
}

interface ConnectionsData {
  defaultSlug?: string;
  connections: ConnectionMeta[];
}

const SCHEMA: FileSchema<ConnectionsData> = {
  path: Paths.connections(),
  currentVersion: 1,
  defaultValue: { connections: [] },
  migrations: [
    // No prior versions yet; fresh installs use defaultValue. Append entries
    // here when bumping `currentVersion`.
  ],
};

export function listConnections(): ConnectionMeta[] {
  return load(SCHEMA).connections;
}

export function getDefaultSlug(): string | undefined {
  const d = load(SCHEMA);
  return d.defaultSlug ?? d.connections[0]?.slug;
}

export function setDefaultSlug(slug: string | undefined): void {
  const d = load(SCHEMA);
  d.defaultSlug = slug;
  save(SCHEMA, d);
}

/** Save metadata + secrets together. Either both succeed or we don't try to. */
export function saveConnection(meta: ConnectionMeta, cred: Credential): void {
  setCredential(meta.slug, cred); // do secrets first — failure leaves no orphan
  const d = load(SCHEMA);
  d.connections = d.connections.filter((c) => c.slug !== meta.slug).concat(meta);
  if (!d.defaultSlug) d.defaultSlug = meta.slug;
  save(SCHEMA, d);
}

export function deleteConnection(slug: string): void {
  const d = load(SCHEMA);
  d.connections = d.connections.filter((c) => c.slug !== slug);
  if (d.defaultSlug === slug) d.defaultSlug = d.connections[0]?.slug;
  save(SCHEMA, d);
  deleteCredential(slug); // secrets last — leaving an orphan secret is harmless
}

export { getCredential };
