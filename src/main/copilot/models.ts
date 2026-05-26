// Live Copilot model discovery.
//
// Hits Copilot's /models endpoint with the user's OAuth token and returns
// only models the user's tier (Individual / Business / Enterprise) is
// allowed to use. The token's `proxy-ep` claim picks the right
// regional endpoint.

import { refreshGitHubCopilotToken } from '@mariozechner/pi-ai/oauth';
import type { ModelDef } from '../storage/connections';

const COPILOT_HEADERS = {
  // VS Code Copilot Chat client identification — required by GitHub's proxy.
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
  Accept: 'application/json',
} as const;

const FETCH_TIMEOUT_MS = 15_000;

// Embedding / non-chat model id prefixes Copilot still includes in /models.
// Add to this list if a new vendor ships a non-chat family.
const NON_CHAT_PREFIXES = ['text-embedding-', 'embed-'];

interface RawCopilotModel {
  id: string;
  name?: string;
  vendor?: string;
  capabilities?: {
    family?: string;
    type?: string;
    supports?: { tool_calls?: boolean; vision?: boolean };
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
  };
  policy?: { state?: string };
  model_picker_enabled?: boolean;
  model_picker_category?: 'powerful' | 'versatile' | 'lightweight';
  preview?: boolean;
}

function getBaseUrlFromToken(token: string): string | null {
  // Copilot API tokens encode the regional proxy endpoint as
  // `proxy-ep=<host>` in a semicolon-delimited claims string.
  const match = token.match(/proxy-ep=([^;]+)/);
  if (!match?.[1]) return null;
  // Convention: replace `proxy.` prefix with `api.` for the chat host.
  const apiHost = match[1].replace(/^proxy\./, 'api.');
  return `https://${apiHost}`;
}

function dropReason(raw: RawCopilotModel): string {
  if (!raw?.id) return 'no-id';
  if (raw.policy?.state && raw.policy.state !== 'enabled') {
    return `policy=${raw.policy.state}`;
  }
  if (NON_CHAT_PREFIXES.some((p) => raw.id.startsWith(p))) return 'non-chat';
  // Respect GitHub's "model_picker_enabled" flag — only show models approved for user selection.
  if (!raw.model_picker_enabled) return 'not-user-facing';
  // Filter out preview/experimental models to avoid confusing users.
  if (raw.preview) return 'preview';
  return 'unknown';
}

function modelDefFrom(raw: RawCopilotModel): ModelDef | null {
  if (!raw?.id) return null;
  // Only surface models the user's tier has enabled.
  if (raw.policy?.state && raw.policy.state !== 'enabled') return null;
  // Embedding-only models are id-prefixed by Copilot's API; rather than
  // gating on `capabilities.type` (which excluded valid completion-style
  // chat models like Codex variants), drop the few known non-chat prefixes.
  if (NON_CHAT_PREFIXES.some((p) => raw.id.startsWith(p))) return null;
  // NEW: Respect GitHub's curation — only models GitHub marks as user-facing.
  if (!raw.model_picker_enabled) return null;
  // NEW: Skip preview/experimental models.
  if (raw.preview) return null;

  const ctx = raw.capabilities?.limits?.max_context_window_tokens ?? 128_000;
  const family = raw.capabilities?.family ?? '';
  const description = describe(raw, family);

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    shortName: shortNameFrom(raw.id, family),
    description,
    contextWindow: ctx,
  };
}

function shortNameFrom(id: string, family: string): string {
  // "claude-sonnet-4.6" → "Sonnet"; "gpt-5.1-codex" → "GPT-5.1 Codex"
  const lc = id.toLowerCase();
  if (lc.includes('sonnet')) return 'Sonnet';
  if (lc.includes('haiku')) return 'Haiku';
  if (lc.includes('opus')) return 'Opus';
  if (lc.includes('codex')) {
    const m = /gpt-([\d.]+)/.exec(lc);
    return m ? `GPT-${m[1]} Codex` : 'Codex';
  }
  if (lc.startsWith('gpt-')) {
    const m = /gpt-([\d.]+)/.exec(lc);
    return m ? `GPT-${m[1]}` : 'GPT';
  }
  if (lc.includes('gemini')) return 'Gemini';
  if (lc.includes('grok')) return 'Grok';
  return family || id;
}

function describe(raw: RawCopilotModel, family: string): string {
  const vendor = raw.vendor ?? family ?? 'Copilot';
  const tools = raw.capabilities?.supports?.tool_calls ? 'tools' : 'chat';
  const vision = raw.capabilities?.supports?.vision ? ' · vision' : '';
  return `${vendor} via Copilot · ${tools}${vision}`;
}

/**
 * Fetch the live, tier-filtered model list for a Copilot OAuth credential.
 * Throws on auth or network failure — caller decides whether to fall back.
 */
export async function fetchCopilotModels(
  githubRefreshToken: string,
): Promise<ModelDef[]> {
  // Step 1: GitHub OAuth → Copilot API token.
  const creds = await refreshGitHubCopilotToken(githubRefreshToken);
  const apiToken = creds.access;

  // Step 2: derive regional API base from the token.
  const baseUrl = getBaseUrlFromToken(apiToken);
  if (!baseUrl) {
    throw new Error(
      'Could not extract Copilot API base URL from the OAuth token (missing proxy-ep claim).',
    );
  }

  // Step 3: GET /models with VS Code Copilot headers.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { ...COPILOT_HEADERS, Authorization: `Bearer ${apiToken}` },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Copilot /models ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as
    | { data?: RawCopilotModel[] }
    | { models?: RawCopilotModel[] }
    | RawCopilotModel[];
  
  // DEBUG: Log the raw API response
  console.log('[fetchCopilotModels] Raw API Response:', JSON.stringify(body, null, 2));
  
  const list: RawCopilotModel[] = Array.isArray(body)
    ? body
    : ('data' in body && body.data) || ('models' in body && body.models) || [];

  const out: ModelDef[] = [];
  const dropped: Array<{ id: string; reason: string; details: Partial<RawCopilotModel> }> = [];
  for (const raw of list) {
    const def = modelDefFrom(raw);
    if (def) {
      out.push(def);
    } else if (raw?.id) {
      dropped.push({
        id: raw.id,
        reason: dropReason(raw),
        details: {
          name: raw.name,
          model_picker_enabled: raw.model_picker_enabled,
          preview: raw.preview,
          model_picker_category: raw.model_picker_category,
        },
      });
    }
  }
  // Detailed breakdown for debugging.
  const pickerDisabled = dropped.filter((d) => d.reason === 'not-user-facing').length;
  const previewModels = dropped.filter((d) => d.reason === 'preview').length;
  const otherDropped = dropped.filter((d) => !['not-user-facing', 'preview'].includes(d.reason));
  console.warn(
    `[fetchCopilotModels] received=${list.length} kept=${out.length} dropped=${dropped.length}` +
      ` | picker_disabled=${pickerDisabled} preview=${previewModels} other=${otherDropped.length}`,
  );
  if (dropped.length) {
    console.log('[fetchCopilotModels] Dropped models:', dropped);
  }
  // NEW: Sort by category (powerful → versatile → lightweight) then by name.
  // Build a category map from raw data to apply consistent ordering.
  const categoryMap = new Map<string, number>();
  for (const raw of list) {
    if (raw?.id && raw.model_picker_category) {
      const order = raw.model_picker_category === 'powerful' ? 0 : raw.model_picker_category === 'versatile' ? 1 : 2;
      categoryMap.set(raw.id, order);
    }
  }
  out.sort((a, b) => {
    const catA = categoryMap.get(a.id) ?? 999;
    const catB = categoryMap.get(b.id) ?? 999;
    if (catA !== catB) return catA - catB;
    return a.name.localeCompare(b.name);
  });
  
  // DEBUG: Log the final curated list
  console.log('[fetchCopilotModels] Final curated list (sorted):', JSON.stringify(out, null, 2));
  
  return out;
}
