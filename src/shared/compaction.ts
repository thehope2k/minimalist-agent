// Window-relative compaction tuning — resolves fraction-of-context-window
// settings into the absolute token counts the Pi SDK's compaction trigger
// expects (`contextTokens > contextWindow - reserveTokens`). Electron-free:
// shared by the renderer (settings UI, context badge), main (agent.ts), and
// the pi-server subprocess (actual session construction) so all three derive
// identical numbers from identical inputs.

export interface CompactionTuning {
  enabled?: boolean;
  /** Fraction of contextWindow reserved for the model's response + safety margin. */
  reserveFraction?: number;
  reserveTokensFloor?: number;
  reserveTokensCeiling?: number;
  /** Fraction of contextWindow kept verbatim (never summarized) after a compaction. */
  keepRecentFraction?: number;
  keepRecentTokensFloor?: number;
  keepRecentTokensCeiling?: number;
}

export interface ResolvedCompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

export interface CompactionModelInfo {
  contextWindow: number;
  /** The model's maximum output tokens, when known. */
  maxTokens?: number;
}

export const DEFAULT_COMPACTION_ENABLED = true;
export const DEFAULT_RESERVE_FRACTION = 0.15;
export const DEFAULT_RESERVE_TOKENS_FLOOR = 4_096;
export const DEFAULT_RESERVE_TOKENS_CEILING = 100_000;
export const DEFAULT_KEEP_RECENT_FRACTION = 0.1;
export const DEFAULT_KEEP_RECENT_TOKENS_FLOOR = 2_048;
export const DEFAULT_KEEP_RECENT_TOKENS_CEILING = 20_000;

/** reserveTokens + keepRecentTokens may never eat more than this share of the
 *  window, or compaction would trigger with nothing meaningful left to summarize. */
const MAX_PROTECTED_WINDOW_SHARE = 0.85;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveCompactionSettings(
  tuning: CompactionTuning | undefined,
  model: CompactionModelInfo,
): ResolvedCompactionSettings {
  const enabled = tuning?.enabled ?? DEFAULT_COMPACTION_ENABLED;
  const { contextWindow } = model;

  let reserveTokens = clamp(
    Math.round(contextWindow * (tuning?.reserveFraction ?? DEFAULT_RESERVE_FRACTION)),
    tuning?.reserveTokensFloor ?? DEFAULT_RESERVE_TOKENS_FLOOR,
    tuning?.reserveTokensCeiling ?? DEFAULT_RESERVE_TOKENS_CEILING,
  );
  let keepRecentTokens = clamp(
    Math.round(contextWindow * (tuning?.keepRecentFraction ?? DEFAULT_KEEP_RECENT_FRACTION)),
    tuning?.keepRecentTokensFloor ?? DEFAULT_KEEP_RECENT_TOKENS_FLOOR,
    tuning?.keepRecentTokensCeiling ?? DEFAULT_KEEP_RECENT_TOKENS_CEILING,
  );

  const protectedTotal = reserveTokens + keepRecentTokens;
  const protectedCeiling = contextWindow * MAX_PROTECTED_WINDOW_SHARE;
  if (protectedTotal > protectedCeiling && protectedTotal > 0) {
    const scale = protectedCeiling / protectedTotal;
    reserveTokens = Math.round(reserveTokens * scale);
    keepRecentTokens = Math.round(keepRecentTokens * scale);
  }

  return { enabled, reserveTokens, keepRecentTokens };
}

/**
 * Keep Pi's per-request output limit within the configured compaction reserve.
 * This makes `contextWindow - reserveTokens` safe without discarding a user's
 * reserve ceiling in favor of the model catalog's theoretical maximum output.
 */
export function capModelOutputToCompactionReserve<M extends CompactionModelInfo>(
  model: M,
  reserveTokens: number,
): M {
  return {
    ...model,
    maxTokens: model.maxTokens && model.maxTokens > 0
      ? Math.min(model.maxTokens, reserveTokens)
      : reserveTokens,
  };
}
