// Remote model discovery for OpenAI-compatible providers.
//
// The OpenAI `GET /v1/models` response only carries ids (no context window
// or capabilities), so this returns bare ids. The renderer merges them onto
// the curated preset metadata — preset models keep their rich fields, any
// extra ids the API reports get appended with safe defaults.

export interface RemoteModelsResult {
  ids: string[];
}

interface ModelRow {
  id?: unknown;
  capabilities?: { chat_completion?: boolean };
}

/** Ensure the base ends in a version path, mirroring the chat client. `modelInPath` bases have none. */
export function normalizeBase(baseUrl: string, modelInPath = false): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return modelInPath || /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

export async function fetchOpenAICompatibleModelIds(
  baseUrl: string,
  apiKey?: string,
  modelInPath = false,
): Promise<RemoteModelsResult | { error: string }> {
  if (!baseUrl.trim()) return { error: 'Base URL is required.' };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${normalizeBase(baseUrl, modelInPath)}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: ctrl.signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { error: 'Invalid or unauthorized API key.' };
      }
      return { error: `Provider returned HTTP ${res.status}.` };
    }
    const json = (await res.json()) as { data?: ModelRow[] } | ModelRow[];
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    const ids = rows
      // Gateways also list embedding/image/TTS deployments.
      .filter((r) => r?.capabilities?.chat_completion !== false)
      .map((r) => r?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return { error: 'Provider exposed no models.' };
    return { ids: [...new Set(ids)].sort() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeout);
  }
}
