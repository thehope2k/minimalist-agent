// Model lists for subscription connections (ChatGPT/Codex, Claude) come from
// pi-ai's bundled catalog rather than a provider endpoint, so they only change
// when pi is upgraded — revalidation picks them up without a reconnect.

import type { ModelDef } from './connections';

export type BuiltinCatalogProvider = 'openai-codex' | 'anthropic';

interface CatalogModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: string[];
}

export async function builtinCatalogModels(provider: BuiltinCatalogProvider): Promise<ModelDef[]> {
  const { getBuiltinModels } = await import('@earendil-works/pi-ai/providers/all');
  const raw = getBuiltinModels(provider) as CatalogModel[];
  return provider === 'openai-codex' ? codexModels(raw) : claudeModels(raw);
}

function codexModels(raw: CatalogModel[]): ModelDef[] {
  return [...raw]
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      shortName: m.name,
      description: 'Codex',
      contextWindow: m.contextWindow ?? 272_000,
      supportsReasoning: m.reasoning,
    }));
}

function claudeModels(raw: CatalogModel[]): ModelDef[] {
  return (
    raw
      // Dated snapshots (claude-opus-4-5-20251101) duplicate their alias.
      .filter((m) => !/-\d{8}$/.test(m.id))
      .sort((a, b) => b.id.localeCompare(a.id))
      .map((m) => ({
        id: m.id,
        name: m.name.replace(/\s*\(latest\)$/, ''),
        shortName: m.name.replace(/^Claude\s+/, '').replace(/\s*\(latest\)$/, ''),
        description: 'Claude subscription',
        contextWindow: m.contextWindow ?? 200_000,
        maxOutputTokens: m.maxTokens,
        supportsReasoning: m.reasoning,
        supportsVision: m.input?.includes('image'),
      }))
  );
}
