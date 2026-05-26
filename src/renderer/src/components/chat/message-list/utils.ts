/** Format a token count for the compact metadata pill. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

/** Human-readable placeholder for an assistant turn that produced no parts. */
export function emptyTurnLabel(stopReason?: string): string {
  switch (stopReason) {
    case 'aborted': return 'Stopped before the assistant responded.';
    case 'max_turns': return 'Reached the turn limit before producing a response.';
    case undefined:
    case '': return 'No response — the turn ended before reaching the assistant.';
    default: return `No response (${stopReason}).`;
  }
}

/** Map a message intent tag to a short chip label, or null to hide the chip. */
export function labelForIntent(tag?: string): string | null {
  switch (tag) {
    case 'add-skill': return 'Add Skill';
    case 'edit-skill-metadata': return 'Edit Metadata';
    case 'edit-skill-instructions': return 'Edit Instructions';
    case 'add-agent': return 'Add Agent';
    case 'edit-agent-metadata': return 'Edit Metadata';
    case 'edit-agent-instructions': return 'Edit System Prompt';
    case 'add-extension': return 'Add Extension';
    case 'edit-extension-metadata': return 'Edit Extension';
    case 'edit-extension-instructions': return 'Edit Guide';
    case 'steer': return 'Injected mid-turn';
    default: return null;
  }
}

export function partKey(kind: string, toolUseId: string | undefined, i: number): string {
  if (kind === 'tool') return `tool:${toolUseId}`;
  return `${kind}:${i}`;
}
