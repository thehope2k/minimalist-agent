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

export type ProviderType = 'anthropic' | 'pi' | 'local' | 'openai-compatible';
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
  supportsReasoning?: boolean;
  maxOutputTokens?: number;
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
  /** Required when providerType === 'local' | 'openai-compatible'; base URL of the model server. */
  baseUrl?: string;
  /** Preset id for 'openai-compatible' connections (e.g. 'stepfun'); 'custom' for hand-entered. */
  presetId?: string;
  defaultModel: string;
  models: ModelDef[];
  /**
   * Epoch ms of the last successful live model fetch. The persisted `models`
   * list is a *cache*; this timestamp drives stale-while-revalidate refreshing
   * (see `model-refresh.ts`). Absent/0 ⇒ treat as stale and revalidate ASAP.
   * Undefined for providers without a live catalog (static registries).
   */
  modelsFetchedAt?: number;
  createdAt: number;
}

interface ConnectionsData {
  defaultSlug?: string;
  connections: ConnectionMeta[];
}

// v1 → v2: `modelsFetchedAt` drives the model-cache TTL. Connections written
// under v1 lack it; stamp them 0 (stale) so the first boot revalidates any
// provider that supports a live catalog.
function migrateV1toV2(prev: unknown): ConnectionsData {
  const data = (prev ?? {}) as ConnectionsData;
  return {
    ...data,
    connections: (data.connections ?? []).map((c) => ({
      ...c,
      modelsFetchedAt: c.modelsFetchedAt ?? 0,
    })),
  };
}

// v2 → v3 was a bad migration (applied a vision heuristic that incorrectly
// marked all Copilot models as supportsVision:true). v3 → v4 corrects this by
// zeroing modelsFetchedAt on all Copilot connections so the real API is
// re-queried on the next boot and the correct values are stored.
function migrateV3toV4(prev: unknown): ConnectionsData {
  const data = (prev ?? {}) as ConnectionsData;
  return {
    ...data,
    connections: (data.connections ?? []).map((c) => {
      const isCopilot =
        c.providerType === 'pi' && c.piAuthProvider === 'github-copilot';
      if (!isCopilot) return c;
      return { ...c, modelsFetchedAt: 0 };
    }),
  };
}

const SCHEMA: FileSchema<ConnectionsData> = {
  path: Paths.connections(),
  currentVersion: 4,
  defaultValue: { connections: [] },
  migrations: [
    // index 0: v0 (legacy/unset) → v1. Identity passthrough.
    (prev) => (prev ?? { connections: [] }) as ConnectionsData,
    // index 1: v1 → v2 — stamp connections with a (stale) modelsFetchedAt.
    migrateV1toV2,
    // index 2: v2 → v3 — bad heuristic migration (vision flags). Identity passthrough.
    (prev) => (prev ?? { connections: [] }) as ConnectionsData,
    // index 3: v3 → v4 — zero modelsFetchedAt for Copilot connections to
    // force a re-fetch and correct the bad supportsVision values.
    migrateV3toV4,
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

/**
 * Atomically replace a single connection's model cache. Re-reads the store
 * before writing so a concurrent edit (save/delete elsewhere) isn't clobbered.
 * Repairs `defaultModel` if it no longer exists in the new list. Returns the
 * updated meta, or null if the connection vanished mid-flight.
 */
export function updateConnectionModels(
  slug: string,
  models: ModelDef[],
  fetchedAt: number,
): ConnectionMeta | null {
  const d = load(SCHEMA);
  const idx = d.connections.findIndex((c) => c.slug === slug);
  if (idx === -1) return null;
  const prev = d.connections[idx];
  const defaultStillValid = models.some((m) => m.id === prev.defaultModel);
  const next: ConnectionMeta = {
    ...prev,
    models,
    modelsFetchedAt: fetchedAt,
    defaultModel:
      defaultStillValid || models.length === 0
        ? prev.defaultModel
        : models[0].id,
  };
  d.connections[idx] = next;
  save(SCHEMA, d);
  return next;
}

export function deleteConnection(slug: string): void {
  const d = load(SCHEMA);
  d.connections = d.connections.filter((c) => c.slug !== slug);
  if (d.defaultSlug === slug) d.defaultSlug = d.connections[0]?.slug;
  save(SCHEMA, d);
  deleteCredential(slug); // secrets last — leaving an orphan secret is harmless
}

export { getCredential };
