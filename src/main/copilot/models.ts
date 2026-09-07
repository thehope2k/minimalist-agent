// Live Copilot model discovery.
//
// GitHub Copilot only allows using models enabled for the account's tier
// (Individual / Business / Enterprise policy). `@earendil-works/pi-ai`
// already computes that tier-filtered id list server-side on every OAuth
// refresh (hitting Copilot's /models endpoint itself) and returns it as
// `availableModelIds` — so we reuse that instead of re-fetching /models
// and re-implementing the same tier filtering ourselves.

import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot';
import { GITHUB_COPILOT_MODELS } from '@earendil-works/pi-ai/providers/github-copilot.models';
import type { ModelDef } from '../storage/connections';
import { createLogger } from '../logger';
import { AUTH_REFRESH_CEILING_MS } from '../../shared/timeouts';

const log = createLogger('copilot-models');

type CopilotCatalogModel = (typeof GITHUB_COPILOT_MODELS)[keyof typeof GITHUB_COPILOT_MODELS];
const CATALOG = GITHUB_COPILOT_MODELS as Record<string, CopilotCatalogModel>;

function shortNameFrom(id: string): string {
  const lc = id.toLowerCase();
  if (lc.includes('sonnet')) return 'Sonnet';
  if (lc.includes('haiku')) return 'Haiku';
  if (lc.includes('opus')) return 'Opus';
  const gptVersion = /gpt-([\d.]+)/.exec(lc)?.[1];
  if (lc.includes('codex')) return gptVersion ? `GPT-${gptVersion} Codex` : 'Codex';
  if (lc.startsWith('gpt-')) return gptVersion ? `GPT-${gptVersion}` : 'GPT';
  if (lc.includes('gemini')) return 'Gemini';
  if (lc.includes('grok')) return 'Grok';
  return id;
}

function modelDefFrom(model: CopilotCatalogModel): ModelDef {
  const shortName = shortNameFrom(model.id);
  return {
    id: model.id,
    name: model.name,
    shortName,
    description: `${shortName} via Copilot`,
    contextWindow: model.contextWindow,
    supportsVision: model.input.includes('image'),
    // pi's own tier filtering drops any model without tool-call support
    // before it can appear in `availableModelIds`, so everything reachable
    // here is guaranteed tool-call-capable.
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsReasoning: model.reasoning,
    maxOutputTokens: model.maxTokens,
  };
}

function partitionByCatalog(availableModelIds: string[]): {
  known: CopilotCatalogModel[];
  unknownIds: string[];
} {
  const known: CopilotCatalogModel[] = [];
  const unknownIds: string[] = [];
  for (const id of availableModelIds) {
    const model = CATALOG[id];
    if (model) known.push(model);
    else unknownIds.push(id);
  }
  return { known, unknownIds };
}

/**
 * Fetch the tier-filtered model list for a Copilot OAuth credential.
 * Throws on auth or network failure — caller decides whether to fall back.
 */
export async function fetchCopilotModels(githubRefreshToken: string): Promise<ModelDef[]> {
  const oauth = githubCopilotProvider().auth.oauth!;
  const creds = await oauth.refresh(
    { type: 'oauth', access: '', refresh: githubRefreshToken, expires: 0 },
    AbortSignal.timeout(AUTH_REFRESH_CEILING_MS),
  );

  const availableModelIds = creds.availableModelIds;
  if (!Array.isArray(availableModelIds) || !availableModelIds.every((id) => typeof id === 'string')) {
    throw new Error('Copilot OAuth refresh did not return an available-model list.');
  }

  const { known, unknownIds } = partitionByCatalog(availableModelIds);
  if (unknownIds.length > 0) {
    log.warn(`account has ${unknownIds.length} model(s) not in the bundled catalog: ${unknownIds.join(', ')}`);
  }

  return known.map(modelDefFrom).sort((a, b) => a.name.localeCompare(b.name));
}
