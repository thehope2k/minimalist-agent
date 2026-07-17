// Model-catalog revalidation — keeps ConnectionMeta.models as a
// stale-while-revalidate cache rather than a fixed snapshot.
//
// A connection's model list is a *server-owned* resource: GitHub Copilot adds
// and retires models, and OpenAI-compatible providers ship new ids over time.
// This module re-fetches per provider, writes the result back through the
// store's atomic helper, and notifies the renderer so the UI updates live.
//
// Triggers (all funnel through here):
//   • startup        → revalidateStaleConnections()   (TTL-gated, background)
//   • on actual use  → maybeRevalidate(slug)          (TTL-gated, fire-forget)
//   • manual button  → refreshConnectionModels(slug)  (forced, returns result)

import {
  type ConnectionMeta,
  type ModelDef,
  listConnections,
  updateConnectionModels,
} from './connections';
import { getCredential } from './credentials';
import { createLogger } from '../logger';

const log = createLogger('model-refresh');

/** How long a cached model list is considered fresh. */
export const MODELS_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/** Per-slug guard so concurrent triggers don't double-fetch the same connection. */
const inFlight = new Set<string>();

type ChangeListener = (meta: ConnectionMeta) => void;
let changeListener: ChangeListener | null = null;

/** Register the renderer-broadcast hook (wired once from ipc.ts). */
export function onConnectionModelsChanged(cb: ChangeListener): void {
  changeListener = cb;
}

export interface RefreshOk {
  ok: true;
  /** True when the resulting list differs from what was stored. */
  changed: boolean;
  models: ModelDef[];
  fetchedAt: number;
}
export interface RefreshErr {
  ok: false;
  /** 'unsupported' = provider has no live catalog; surface gently, not as failure. */
  reason: 'unsupported' | 'error';
  error?: string;
}
export type RefreshResult = RefreshOk | RefreshErr;

/** Providers whose catalog we can re-fetch live. */
export function isRefreshable(meta: ConnectionMeta): boolean {
  if (meta.providerType === 'pi' && meta.piAuthProvider === 'github-copilot') {
    return true;
  }
  if (meta.providerType === 'openai-compatible' || meta.providerType === 'local') {
    return true;
  }
  return false;
}

function isStale(meta: ConnectionMeta): boolean {
  return Date.now() - (meta.modelsFetchedAt ?? 0) >= MODELS_TTL_MS;
}

function sameModelList(a: ModelDef[], b: ModelDef[]): boolean {
  if (a.length !== b.length) return false;
  // Compare the fields that affect selection/runtime and UI display,
  // order-sensitive (order drives picker presentation).
  return a.every((x, i) => {
    const y = b[i];
    return (
      x.id === y.id &&
      x.name === y.name &&
      x.contextWindow === y.contextWindow &&
      x.category === y.category &&
      !!x.supportsVision === !!y.supportsVision &&
      !!x.supportsReasoning === !!y.supportsReasoning
    );
  });
}

/** Bare-metadata ModelDef for a discovered id we have no rich info for. */
function minimalModel(id: string): ModelDef {
  return {
    id,
    name: id,
    shortName: id.split('/').pop() ?? id,
    description: 'Discovered · OpenAI-compatible',
    contextWindow: 128_000,
    supportsToolCalls: true,
    supportsStreaming: true,
    maxOutputTokens: 8_192,
  };
}

async function fetchForProvider(
  meta: ConnectionMeta,
): Promise<ModelDef[] | { error: string }> {
  const cred = getCredential(meta.slug);

  // ---- Copilot: authoritative tier-filtered list (replace, drop retired) ---
  if (meta.providerType === 'pi' && meta.piAuthProvider === 'github-copilot') {
    if (!cred || cred.type !== 'oauth' || !cred.refreshToken) {
      return { error: 'No GitHub refresh token stored for this connection.' };
    }
    const { fetchCopilotModels } = await import('../copilot/models');
    return fetchCopilotModels(cred.refreshToken);
  }

  // ---- OpenAI-compatible / local: union (keep curated, append discovered) --
  if (meta.providerType === 'openai-compatible' || meta.providerType === 'local') {
    if (!meta.baseUrl) return { error: 'Connection has no base URL.' };
    const apiKey = cred?.type === 'api_key' ? cred.apiKey : undefined;
    const { fetchOpenAICompatibleModelIds } = await import(
      '../openai-compatible/models'
    );
    const res = await fetchOpenAICompatibleModelIds(meta.baseUrl, apiKey);
    if ('error' in res) return { error: res.error };
    // The /models endpoint only carries ids — and may be incomplete or gated —
    // so we *union* rather than replace: existing rich metadata is preserved,
    // and any genuinely new id is appended with safe defaults. We deliberately
    // do not drop ids the endpoint omitted (custom/hand-entered models often
    // aren't advertised).
    const known = new Set(meta.models.map((m) => m.id));
    const additions = res.ids
      .filter((id) => !known.has(id))
      .map((id) => minimalModel(id));
    return [...meta.models, ...additions];
  }

  return { error: 'unsupported' };
}

/**
 * Force a refresh of one connection's model catalog and persist the result.
 * Returns a structured result; never throws.
 */
export async function refreshConnectionModels(slug: string): Promise<RefreshResult> {
  const meta = listConnections().find((c) => c.slug === slug);
  if (!meta) return { ok: false, reason: 'error', error: 'Connection not found.' };
  if (!isRefreshable(meta)) return { ok: false, reason: 'unsupported' };
  if (inFlight.has(slug)) {
    // A concurrent refresh is already running; report current cache as-is.
    return { ok: true, changed: false, models: meta.models, fetchedAt: meta.modelsFetchedAt ?? 0 };
  }

  inFlight.add(slug);
  try {
    const fetched = await fetchForProvider(meta);
    if ('error' in fetched) {
      if (fetched.error === 'unsupported') return { ok: false, reason: 'unsupported' };
      log.warn(`refresh ${slug}: ${fetched.error}`);
      return { ok: false, reason: 'error', error: fetched.error };
    }
    if (fetched.length === 0) {
      log.warn(`refresh ${slug}: provider returned no models; keeping cache.`);
      return { ok: false, reason: 'error', error: 'Provider returned no models.' };
    }

    const fetchedAt = Date.now();
    const changed = !sameModelList(meta.models, fetched);
    // Always stamp the timestamp (even when unchanged) so the TTL clock resets
    // and we don't re-hit the network on every trigger.
    const updated = updateConnectionModels(slug, fetched, fetchedAt);
    if (!updated) {
      return { ok: false, reason: 'error', error: 'Connection removed during refresh.' };
    }
    if (changed) {
      log.info(`refresh ${slug}: ${meta.models.length} → ${fetched.length} models`);
      changeListener?.(updated);
    }
    return { ok: true, changed, models: fetched, fetchedAt };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.warn(`refresh ${slug}: ${error}`);
    return { ok: false, reason: 'error', error };
  } finally {
    inFlight.delete(slug);
  }
}

/**
 * Fire-and-forget revalidation gated on the TTL — safe to call on the hot
 * path (e.g. when a connection is used to send a chat). No-ops when fresh,
 * not refreshable, or already in flight.
 */
export function maybeRevalidate(slug: string): void {
  const meta = listConnections().find((c) => c.slug === slug);
  if (!meta || !isRefreshable(meta) || !isStale(meta) || inFlight.has(slug)) return;
  void refreshConnectionModels(slug).catch(() => {
    /* logged inside; never surface on the hot path */
  });
}

/**
 * Revalidate every stale, refreshable connection in the background. Called
 * once at startup. Sequential to avoid a thundering herd of keychain prompts
 * and token refreshes; each failure is isolated.
 */
export async function revalidateStaleConnections(): Promise<void> {
  const stale = listConnections().filter((c) => isRefreshable(c) && isStale(c));
  if (stale.length === 0) return;
  log.debug(`startup revalidation: ${stale.length} stale connection(s)`);
  for (const c of stale) {
    await refreshConnectionModels(c.slug);
  }
}
