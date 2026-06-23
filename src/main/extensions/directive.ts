import { getExtensionRegistry } from './registry';
import { getExtensionsDir } from './storage';
import { isEnabled } from './types';
import { listMcpExtensionsStatus } from './mcp-config';
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

  // An mcp-backed extension can be enabled yet contribute zero tools — consent
  // not granted, a required secret missing, or its server failed to start. The
  // flat "Enabled" list above would otherwise imply those tools exist, so the
  // model calls a `mcp__<slug>__*` tool that isn't registered and invents a
  // reason. Naming the blocked servers + the fix keeps the block honest and
  // lets the model tell the user what to do. Gated: only present when something
  // is actually blocked.
  const blockedMcp = listMcpExtensionsStatus().filter(
    (s) => !s.ok && s.reason !== 'disabled',
  );
  if (blockedMcp.length > 0) {
    const reason = (s: (typeof blockedMcp)[number]): string => {
      switch (s.reason) {
        case 'no-consent':
          return 'consent not granted — user must approve it in the Extensions panel';
        case 'missing-secrets':
          return 'a required secret is not set';
        case 'connect-failed':
          return `server failed to start${s.error ? `: ${s.error}` : ''}`;
        default:
          return 'unavailable';
      }
    };
    lines.push(
      `MCP not active (their \`mcp__<slug>__*\` tools are NOT available this session — do not call them; tell the user the blocker): ${blockedMcp
        .map((s) => `${s.slug} (${reason(s)})`)
        .join('; ')}`,
    );
  }
  if (disabled.length > 0) {
    lines.push(
      `Disabled (unavailable unless re-enabled): ${disabled.map((e) => e.slug).join(', ')}`,
    );
  }

  return `<extensions>\n${lines.join('\n')}\n</extensions>`;
}
