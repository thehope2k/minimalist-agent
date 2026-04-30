// Model capability helpers for the main-process agent layer.
//
// Kept separate from options.ts (which owns SDK subprocess config) so model
// metadata doesn't leak into the subprocess-env concern.

/**
 * Model IDs (prefix-matched) that support Anthropic's 1-million-token
 * context window. Requires Anthropic API Tier 4+; lower tiers receive a
 * 400 "Invalid Request" when the [1m] suffix is present.
 */
const MODELS_WITH_1M_CONTEXT: ReadonlySet<string> = new Set([
  'claude-opus-4-7',
]);

/**
 * Returns true if the given model ID supports the 1M context window.
 * Strips any existing `[1m]` suffix before matching so callers can pass
 * already-suffixed IDs without double-applying.
 */
export function modelSupports1MContext(modelId: string): boolean {
  const base = modelId.replace(/\[1m\]$/i, '');
  // Exact match first, then prefix match for Bedrock / versioned IDs such as
  // "us.anthropic.claude-opus-4-7-v1".
  if (MODELS_WITH_1M_CONTEXT.has(base)) return true;
  for (const id of MODELS_WITH_1M_CONTEXT) {
    if (base.includes(id)) return true;
  }
  return false;
}

/**
 * Appends the `[1m]` context-window suffix to a model ID when:
 *   - `extendedContext` is `true`, AND
 *   - the model actually supports 1M context.
 *
 * Returns the model ID unchanged otherwise. Safe to call unconditionally
 * — already-suffixed IDs are not double-suffixed.
 */
export function apply1MContextSuffix(
  modelId: string,
  extendedContext: boolean | undefined,
): string {
  if (!extendedContext) return modelId;
  if (modelId.endsWith('[1m]')) return modelId;
  if (!modelSupports1MContext(modelId)) return modelId;
  return `${modelId}[1m]`;
}
