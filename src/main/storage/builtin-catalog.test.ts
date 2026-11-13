import { describe, expect, it } from 'vitest';
import { builtinCatalogModels } from './builtin-catalog';
import { supportsModelCatalogRefresh } from '../../shared/provider-capabilities';

describe('builtinCatalogModels', () => {
  it('lists Codex models from the pi-ai catalog, newest id first', async () => {
    const models = await builtinCatalogModels('openai-codex');
    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-6.1-terra');
    expect(ids).toEqual([...ids].sort((a, b) => b.localeCompare(a)));
    expect(models.every((m) => m.description === 'Codex')).toBe(true);
  });

  it('lists Claude aliases without dated snapshots', async () => {
    const models = await builtinCatalogModels('anthropic');
    const ids = models.map((m) => m.id);
    expect(ids).toContain('claude-fable-5-2');
    expect(ids.some((id) => /-\d{8}$/.test(id))).toBe(false);
    const fable = models.find((m) => m.id === 'claude-fable-5-2');
    expect(fable?.shortName).not.toMatch(/^Claude\s/);
  });
});

describe('subscription connections refresh their model list', () => {
  it.each(['openai-codex', 'anthropic'] as const)('%s is refreshable', (provider) => {
    expect(supportsModelCatalogRefresh(provider)).toBe(true);
  });
});
