import type { ProviderType } from './provider-types';

/** Whether a provider exposes a live model catalog that can be refreshed. */
export function supportsModelCatalogRefresh(providerType: ProviderType): boolean {
  return (
    providerType === 'github-copilot' ||
    providerType === 'openai-compatible' ||
    providerType === 'local' ||
    providerType === 'codemie-sso'
  );
}
