/**
 * Autonomy contract — the single source of truth for "should the agent stop and
 * ask, or just act?".
 *
 * Electron-free (like `otel.ts` / `sub-logger.ts`) so it can be imported from the
 * main process, the pi-server subprocess, and the renderer alike.
 *
 * ## The model
 *
 * Autonomy is a **risk budget on a shared 0–100 scale**, not a vague "engage
 * more/less" hint. The user's autonomy level *is* the threshold: the agent acts
 * on its own for anything below it and engages for anything at or above it.
 *
 *   interrupt ⇔ risk ≥ autonomy   (with one hard floor, below)
 *
 * | Autonomy | Acts silently up to | Behaviour                         |
 * |----------|---------------------|-----------------------------------|
 * | 20       | risk 20             | collaborative — checks in early   |
 * | 50       | risk 50             | balanced                          |
 * | 80       | risk 80             | independent — risk 75 proceeds    |
 * | 100      | risk 84             | maximal, but still can't YOLO     |
 *
 * This is the inverse of the old `100 − autonomy` formula, which made *high*
 * autonomy the chattiest setting — the opposite of its meaning.
 *
 * ## The irreversible floor
 *
 * Some operations are dangerous enough that no autonomy setting should let them
 * run unattended (destructive deletes, force pushes, prod deploys, secret
 * files). `ALWAYS_CONFIRM` is a ceiling on autonomy: at/above it the agent
 * always engages, even at autonomy 100. So "maximal autonomy" still can't mean
 * "delete prod without asking".
 */

/**
 * Risk at/above which the agent ALWAYS engages, regardless of autonomy.
 * Reserved for irreversible / production-critical operations.
 */
export const ALWAYS_CONFIRM = 85;

/**
 * The single interruption rule, shared by the planning gate and the
 * collaboration tools.
 *
 * @param risk     Operation/phase risk on the 0–100 scale.
 * @param autonomy User's autonomy level (0–100).
 * @returns `true` if the agent should engage the user (stop and ask).
 */
export function shouldEngage(risk: number, autonomy: number): boolean {
  const r = clamp(risk);
  if (r >= ALWAYS_CONFIRM) return true;
  return r >= clamp(autonomy);
}

/**
 * Highest risk the agent will act on *without* engaging, for a given autonomy
 * level. Useful for surfacing the contract in the UI ("acts on its own up to N").
 *
 * Because `ALWAYS_CONFIRM` is a hard ceiling, the silent band can never reach it.
 */
export function silentRiskCeiling(autonomy: number): number {
  return Math.min(clamp(autonomy), ALWAYS_CONFIRM) - 1;
}

/**
 * One-line, user-facing description of what an autonomy level means in terms of
 * the actual threshold. Keep this the canonical phrasing so the slider tooltip,
 * settings copy, and prompt text don't drift.
 */
export function describeAutonomy(autonomy: number): string {
  const ceiling = silentRiskCeiling(autonomy);
  return `Acts on its own up to risk ${ceiling}; checks in at or above ${clamp(
    autonomy,
  )}, and always confirms at ${ALWAYS_CONFIRM}+.`;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
