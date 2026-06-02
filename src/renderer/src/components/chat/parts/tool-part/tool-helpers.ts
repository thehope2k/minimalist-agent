/**
 * Helper functions for tool rendering and formatting.
 */

export function formatInput(
  input: unknown,
  partialInputJson: string | undefined,
): string {
  if (input !== undefined && input !== null) {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      /* fall through */
    }
  }
  return partialInputJson ?? '';
}

/**
 * Tool results arrive as a string from the SDK, but for MCP tools that
 * string is an envelope (`{isError, content: [{type:'text', text}, ...]}`).
 * Showing the raw envelope is noisy and double-escapes newlines. Unwrap it
 * to the inner text where possible, pretty-print other JSON, and fall back
 * to the original string for plain output.
 */
export function normalizeResult(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return text;
  }
  // MCP envelope.
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { content?: unknown }).content)
  ) {
    const blocks = (parsed as { content: Array<{ type?: string; text?: string }> }).content;
    const flattened = blocks
      .map((b) => (b?.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n\n');
    if (flattened) return flattened;
  }
  // Other JSON — pretty-print.
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

export function resultPreviewLine(text: string): string {
  const normalized = normalizeResult(text)
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized.length > 220 ? `${normalized.slice(0, 219)}…` : normalized;
}

export function pickTaskPreview(input: unknown, fallback?: string): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const agent = typeof o.agent === 'string'
      ? o.agent
      : (typeof o.subagent_type === 'string' ? o.subagent_type : '');
    const task = typeof o.task === 'string'
      ? o.task
      : (typeof o.description === 'string' ? o.description : '');
    const text = [agent, task].filter(Boolean).join(': ');
    if (text.trim()) return text;
  }
  return fallback ?? '';
}

export function subagentPhaseLabel(phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error'): string {
  switch (phase) {
    case 'spawning': return 'Spawning';
    case 'running': return 'Running';
    case 'finalizing': return 'Finalizing';
    case 'done': return 'Done';
    case 'error': return 'Failed';
    default: return 'Running';
  }
}
