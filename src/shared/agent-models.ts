/**
 * Central model catalog for agent configuration.
 * 
 * This is the single source of truth for valid model IDs across:
 * - Agent AGENT.md frontmatter validation
 * - Build Agent scaffold prompt
 * - Runtime model resolution
 * - Reference documentation
 */

/**
 * Central model catalog for agent configuration.
 * 
 * Agents are GLOBAL - not tied to specific connections. The same agent
 * can be used with GitHub Copilot, ChatGPT Plus, or custom endpoints.
 * 
 * This catalog lists all known model IDs across all providers.
 * Runtime validation checks if a model is available for the current connection.
 * 
 * Updated May 2026 based on:
 * - GitHub Copilot: https://docs.github.com/en/copilot/reference/ai-models/supported-models
 * - OpenAI Codex: https://developers.openai.com/codex/models
 */

/** All known model IDs across all providers */
export const KNOWN_MODEL_IDS = [
  // OpenAI GPT-5 series
  'gpt-4.1',         // Legacy, retiring June 2026
  'gpt-5-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  
  // Anthropic Claude 4.5-4.7 series
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  
  // Google Gemini series
  'gemini-2.5-pro',
  'gemini-3-flash',
  'gemini-3.1-pro',
  'gemini-3.5-flash',
  
  // Fine-tuned / specialized models
  'raptor-mini',
  'goldeneye',
] as const;

/** Special keyword that means "inherit from parent session" */
export const SESSION_DEFAULT_MODEL = 'session-default' as const;
/**
 * Check if a model ID is valid (known across all providers).
 * 
 * @param modelId - Model ID from AGENT.md (e.g., "claude-sonnet-4.6" or "session-default")
 * @returns true if valid, false otherwise
 */
export function isValidModelId(modelId: string): boolean {
  // Special keyword is always valid
  if (modelId === SESSION_DEFAULT_MODEL) return true;
  
  // Check against all known models
  return KNOWN_MODEL_IDS.includes(modelId as never);
}

/**
 * Get validation error message for an invalid model ID.
 */
export function getModelValidationError(modelId: string): string {
  if (isValidModelId(modelId)) return '';
  
  // Show a sample of common models
  const commonModels = [
    'gpt-5.5',
    'gpt-5.4',
    'claude-opus-4.7',
    'claude-sonnet-4.6',
    'gemini-3.5-flash',
  ];
  
  return (
    `Unknown model ID "${modelId}". ` +
    `Common models: ${commonModels.join(', ')}, or "${SESSION_DEFAULT_MODEL}" to inherit session model. ` +
    `Note: Model availability depends on your connection (GitHub Copilot, ChatGPT Plus, or custom endpoint).`
  );
}

/**
 * Resolve a model ID, handling the session-default keyword.
 * 
 * @param agentModel - Model from AGENT.md (may be undefined or "session-default")
 * @param sessionModel - Current session's model
 * @returns The resolved model ID
 */
export function resolveAgentModel(
  agentModel: string | undefined,
  sessionModel: string,
): string {
  // Omitted or explicit session-default → inherit from session
  if (!agentModel || agentModel === SESSION_DEFAULT_MODEL) {
    return sessionModel;
  }
  
  // Explicit model override
  return agentModel;
}
