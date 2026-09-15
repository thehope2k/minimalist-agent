import type { SubagentProgressUpdate } from '../../agent-runtime/events';

export function parseSubagentUpdate(update: unknown): SubagentProgressUpdate | null {
  if (!update || typeof update !== 'object') return null;
  const u = update as Partial<SubagentProgressUpdate> & { kind?: unknown };
  if (u.kind !== 'subagent') return null;
  if (typeof u.execId !== 'string' || typeof u.agentSlug !== 'string') return null;
  return {
    kind: 'subagent',
    execId: u.execId,
    agentSlug: u.agentSlug,
    agentName: typeof u.agentName === 'string' ? u.agentName : undefined,
    phase: u.phase,
    detail: typeof u.detail === 'string' ? u.detail : undefined,
    event: u.event,
    at: typeof u.at === 'number' ? u.at : undefined,
  };
}

export function pickAssistantText(message: unknown): string {
  // AgentMessage.content is an array of content blocks; collect text blocks.
  const m = message as {
    role?: string;
    content?: Array<{ type?: string; text?: string }> | string;
  };
  if (!m?.content) return '';
  if (typeof m.content === 'string') return m.content;
  return m.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('');
}

export function isAssistantMessage(message: unknown): boolean {
  return (message as { role?: string } | null)?.role === 'assistant';
}

/**
 * Looser check used in the snapshot-diff fallback: accept anything that
 * *isn't* clearly a user message. Some Pi providers omit `role` on the
 * partial assistant message during early streaming; refusing those would
 * leave us with an empty bubble.
 */
export function looksLikeAssistantSnapshot(message: unknown): boolean {
  const m = message as { role?: string } | null;
  if (!m) return false;
  return m.role !== 'user' && m.role !== 'tool';
}

export function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  if (typeof result === 'object') {
    // Pi tool results often expose `output` or `text`. Fall back to JSON.
    const r = result as { output?: unknown; text?: unknown };
    if (typeof r.output === 'string') return r.output;
    if (typeof r.text === 'string') return r.text;
    try {
      return JSON.stringify(result);
    } catch {
      /* */
    }
  }
  return String(result);
}
