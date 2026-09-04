// Pure model-shaping helpers — no subprocess state, no side effects.
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Api, Model, ThinkingLevel } from '@earendil-works/pi-ai';
import type { PiThinkingLevel } from '../agent-runtime/backends/pi/protocol';

/** Our protocol's level → Pi's accepted set ('minimal'..'max').
 *  'off' has no Pi equivalent → 'minimal'. All other levels pass through
 *  1:1; Pi SDK clamps per model internally (e.g. GPT-5.6 accepts 'max'
 *  natively; older models degrade to their ceiling). */
export function mapThinkingLevel(level: PiThinkingLevel): ThinkingLevel {
  if (level === 'off') return 'minimal';
  return level;
}

/**
 * Drop 'image' from a model's accepted input when the app reports no vision
 * support. Returns a shallow clone (never mutates the shared registry model).
 * `visionSupported === undefined` means "unknown" → leave input untouched.
 */
export function applyVisionInput<M extends { input?: readonly ('text' | 'image')[] }>(
  model: M,
  visionSupported: boolean | undefined,
): M {
  if (visionSupported !== false || !model?.input) return model;
  if (!model.input.includes('image')) return model;
  return { ...model, input: model.input.filter((i) => i !== 'image') };
}

/** Overrides `model.baseUrl` with the credential's actual resolved endpoint —
 *  compaction/branch-summary in pi-coding-agent bypass ModelRuntime's own
 *  per-request override and would otherwise use the static catalog default. */
export async function withResolvedBaseUrl<M extends Model<Api>>(
  model: M,
  modelRuntime: ModelRuntime,
): Promise<M> {
  const resolution = await modelRuntime.getAuth(model).catch(() => undefined);
  const baseUrl = resolution?.auth.baseUrl;
  return baseUrl && baseUrl !== model.baseUrl ? { ...model, baseUrl } : model;
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}
