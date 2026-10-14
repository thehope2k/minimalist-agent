import { getExtensionRegistry } from './registry';
import { loadAllExtensions } from './storage';
import { listMcpExtensionsStatus } from './mcp-config';

export function formatExtensionsAwareness(
  cwd: string | undefined,
  activatedSlugs: ReadonlySet<string>,
): string {
  const all = cwd ? loadAllExtensions(cwd) : getExtensionRegistry().list();

  if (all.length === 0) return '';

  const lines: string[] = [];
  lines.push(
    'Installed extension capabilities (CLIs / MCP servers / usage guides). Before using one for the first time this session, read its guide at the exact path below. Mentioning `@slug` also auto-surfaces its guide.',
  );
  const isDormant = (e: (typeof all)[number]): boolean =>
    Boolean(e.config.mcp) && e.scope === 'user' && !activatedSlugs.has(e.slug);
  lines.push('Enabled:');
  for (const e of all.filter((ext) => !isDormant(ext))) {
    lines.push(`- ${e.slug} (${e.scope}): ${e.guidePath}`);
  }

  const dormant = all.filter(isDormant);
  if (dormant.length > 0) {
    lines.push(
      'Available but NOT loaded (their `mcp__<slug>__*` tools do not exist this session). Do not guess at them; if the task needs one, tell the user to mention `@slug` in a message to activate it:',
    );
    for (const e of dormant) {
      lines.push(`- ${e.slug}: ${e.config.mcp?.description ?? e.config.description}`);
    }
  }

  const blockedMcp = listMcpExtensionsStatus(cwd).filter((s) => !s.ok);
  if (blockedMcp.length > 0) {
    const reason = (s: (typeof blockedMcp)[number]): string => {
      switch (s.reason) {
        case 'no-consent':
          return 'consent not granted — user must approve it in the Extensions panel';
        case 'missing-setup':
          return `setup incomplete — user must fill in${s.missing?.length ? `: ${s.missing.join(', ')}` : ' the Setup form'} on the extension's page`;
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
