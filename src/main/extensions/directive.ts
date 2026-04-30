import { getExtensionRegistry } from './registry';
import {
  displayDescription,
  displayName,
  isEnabled,
  type LoadedExtension,
} from './types';

/**
 * Build the `<extensions>` block that gets appended to the per-turn prompt
 * prefix. Always-on awareness — distinct from Skills' per-mention directive.
 *
 * Format mirrors Craft's source state block: enumerate active extensions
 * with their guide path, mention disabled ones tersely, and tell the model
 * it MUST read each extension's guide.md before invoking its capabilities.
 *
 * Returns '' when there are no extensions installed at all (so we don't
 * pollute prompts on a fresh install).
 */
export function formatExtensionsAwareness(): string {
  const all = getExtensionRegistry().list();
  if (all.length === 0) return '';

  const enabled = all.filter((e) => isEnabled(e.config));
  const disabled = all.filter((e) => !isEnabled(e.config));

  const enabledLines = enabled.map(formatEnabledLine).join('\n');
  const disabledLine =
    disabled.length > 0
      ? `\nDisabled (won't be used unless re-enabled): ${disabled
          .map((e) => e.slug)
          .join(', ')}`
      : '';

  const header = enabled.length > 0
    ? 'Installed extensions are listed below. Each adds a capability (a CLI you should use, an MCP server, or a usage guide). Before invoking an extension\'s tools or running its commands for the first time in this session, you MUST read its guide.md using the Read tool — the guide explains how to use it correctly.'
    : 'No enabled extensions in this workspace.';

  const enabledBlock = enabled.length > 0
    ? `\n\nEnabled:\n${enabledLines}`
    : '';

  return `<extensions>\n${header}${enabledBlock}${disabledLine}\n</extensions>`;
}

function formatEnabledLine(ext: LoadedExtension): string {
  const name = displayName(ext);
  const desc = displayDescription(ext);
  const variantTag = `[${ext.variant}]`;
  return `- ${ext.slug} (${name}) ${variantTag}: ${desc}\n  Guide: ${ext.guidePath}`;
}
