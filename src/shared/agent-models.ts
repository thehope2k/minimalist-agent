/**
 * Model ID validation for agent configuration.
 *
 * Agents are GLOBAL — not tied to specific connections. The same agent
 * can be used with GitHub Copilot, ChatGPT, or custom endpoints.
 *
 * Validity is checked against the Pi SDK's live built-in model catalog
 * (`@earendil-works/pi-ai`) rather than a hand-maintained list, so it
 * tracks new model releases automatically as the SDK is updated.
 */

/** Special keyword that means "inherit from parent session" */
export const SESSION_DEFAULT_MODEL = 'session-default' as const;

let knownModelIdsPromise: Promise<Set<string>> | null = null;

async function loadKnownModelIds(): Promise<Set<string>> {
  if (!knownModelIdsPromise) {
    knownModelIdsPromise = (async () => {
      const { getBuiltinModels, getBuiltinProviders } = await import(
        '@earendil-works/pi-ai/providers/all'
      );
      const ids = new Set<string>();
      for (const provider of getBuiltinProviders()) {
        for (const model of getBuiltinModels(provider)) ids.add(model.id);
      }
      return ids;
    })();
  }
  return knownModelIdsPromise;
}

/**
 * Check if a model ID is valid (known across all providers).
 *
 * @param modelId - Model ID from AGENT.md (e.g., "claude-sonnet-4.6" or "session-default")
 * @returns true if valid, false otherwise
 */
export async function isValidModelId(modelId: string): Promise<boolean> {
  if (modelId === SESSION_DEFAULT_MODEL) return true;
  const knownIds = await loadKnownModelIds();
  return knownIds.has(modelId);
}

/**
 * Get validation error message for an invalid model ID.
 */
export async function getModelValidationError(modelId: string): Promise<string> {
  if (await isValidModelId(modelId)) return '';
  return (
    `Unknown model ID "${modelId}". ` +
    `Use "${SESSION_DEFAULT_MODEL}" to inherit the session model, or check your connection's model picker in Settings for available IDs. ` +
    `Note: model availability depends on your connection (GitHub Copilot, ChatGPT, or custom endpoint).`
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
  if (!agentModel || agentModel === SESSION_DEFAULT_MODEL) {
    return sessionModel;
  }
  return agentModel;
}
