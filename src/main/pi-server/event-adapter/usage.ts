import type { AgentUsage } from '../../agent-runtime/events';

export interface NormalizedUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function toAgentUsage(u: NormalizedUsage): AgentUsage {
  return {
    inputTokens: u.input ?? 0,
    outputTokens: u.output ?? 0,
    cacheReadInputTokens: u.cacheRead ?? 0,
    cacheCreationInputTokens: u.cacheWrite ?? 0,
  };
}

export function hasAnyUsage(u: AgentUsage): boolean {
  return !!(
    u.inputTokens ||
    u.outputTokens ||
    u.cacheReadInputTokens ||
    u.cacheCreationInputTokens
  );
}

/**
 * Aggregate usage for one Pi run. `messages` is a fresh array allocated per
 * run()/continue() call in pi-agent-core's agent loop (never the whole session
 * history), so summing it here cannot double-count across turns.
 */
export function sumRunUsage(
  messages: { role?: string; usage?: NormalizedUsage }[],
): AgentUsage | undefined {
  const total: Required<NormalizedUsage> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.usage) continue;
    total.input += m.usage.input ?? 0;
    total.output += m.usage.output ?? 0;
    total.cacheRead += m.usage.cacheRead ?? 0;
    total.cacheWrite += m.usage.cacheWrite ?? 0;
  }
  const usage = toAgentUsage(total);
  return hasAnyUsage(usage) ? usage : undefined;
}
