/** Persisted connection provider identifiers shared across app processes. */
export type ProviderType =
  | 'github-copilot'
  | 'openai-codex'
  | 'local'
  | 'openai-compatible'
  | 'codemie-sso';

/** Providers that authenticate through OAuth and map directly to model providers. */
export type OAuthProvider = Extract<
  ProviderType,
  'github-copilot' | 'openai-codex'
>;

/** Providers exposed through an OpenAI-compatible API endpoint. */
export type ApiProvider = Exclude<ProviderType, OAuthProvider>;

/** Provider identifier passed to the model runtime. */
export type ModelProvider = OAuthProvider | 'openai';
