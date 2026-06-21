import { getExtensionRegistry } from './registry';
import { getExtensionsDir } from './storage';
import { isEnabled } from './types';
import { join } from 'node:path';

/**
 * Build the `<extensions>` block appended to the per-turn prompt prefix.
 *
 * Deliberately TERSE — a flat list of enabled slugs, not per-item
 * descriptions + guide paths. Rationale (see docs/SYSTEM-PROMPT.md): this
 * block is per-turn and uncached on most backends, and full descriptions for
 * every enabled extension diluted attention with capabilities irrelevant to
 * the current task. The slug is the discovery hook; the *content* (what it
 * does, how to drive it) lives in each guide.md and is pulled in on demand —
 * either when the user `@mentions` the slug (the mention directive injects the
 * guide path automatically) or when the model decides to use it and reads the
 * guide via the path convention below.
 *
 * Returns '' when no extensions are installed (clean prompt on fresh install).
 */
export function formatExtensionsAwareness(): string {
  const all = getExtensionRegistry().list();
  if (all.length === 0) return '';

  const enabled = all.filter((e) => isEnabled(e.config));
  const disabled = all.filter((e) => !isEnabled(e.config));

  if (enabled.length === 0 && disabled.length === 0) return '';

  // Path convention so the model can read a guide for unprompted use without
  // us spending a per-item path line on every turn.
  const guideConvention = join(getExtensionsDir(), '<slug>', 'guide.md');

  const lines: string[] = [];
  lines.push(
    `Installed extension capabilities (CLIs / MCP servers / usage guides), referenced by slug. Before using one for the first time this session, read its guide: ${guideConvention}. Mentioning \`@slug\` auto-surfaces its guide.`,
  );
  if (enabled.length > 0) {
    lines.push(`Enabled: ${enabled.map((e) => e.slug).join(', ')}`);
  }
  if (disabled.length > 0) {
    lines.push(
      `Disabled (unavailable unless re-enabled): ${disabled.map((e) => e.slug).join(', ')}`,
    );
  }

  return `<extensions>\n${lines.join('\n')}\n</extensions>`;
}
