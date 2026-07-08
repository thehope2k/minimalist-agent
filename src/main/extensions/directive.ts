import { getExtensionRegistry } from './registry';
import { getExtensionsDir, loadAllExtensions } from './storage';
import { listMcpExtensionsStatus } from './mcp-config';
import { join } from 'node:path';

export function formatExtensionsAwareness(cwd?: string): string {
  const all = cwd
    ? loadAllExtensions(cwd)
    : getExtensionRegistry().list();

  if (all.length === 0) return '';

  const guideConvention = join(getExtensionsDir(), '<slug>', 'guide.md');

  const lines: string[] = [];
  lines.push(
    `Installed extension capabilities (CLIs / MCP servers / usage guides), referenced by slug. Before using one for the first time this session, read its guide: ${guideConvention}. Mentioning \`@slug\` auto-surfaces its guide.`,
  );
  lines.push(`Enabled: ${all.map((e) => e.slug).join(', ')}`);

  const blockedMcp = listMcpExtensionsStatus(cwd).filter((s) => !s.ok);
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

  return `<extensions>\n${lines.join('\n')}\n</extensions>`;
}
