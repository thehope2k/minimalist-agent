// Resolve env values for CLI-bound extensions and merge them into a flat
// record suitable for the agent subprocess `spawn(... { env })` (so Bash
// invocations inside Pi inherit the same vars).
//
// MCP-backed extensions are intentionally skipped — their `env` is plumbed
// per-server via the SDK's `mcpServers` config and shouldn't pollute the
// global Bash env.

import { loadAllExtensions } from './storage';
import { requiresConsent, resolveEnvValue } from './types';
import { getSecret } from './secrets';
import { hasConsent } from './mcp-config';

/**
 * Returns env values to apply to the agent process. Only includes:
 *   - Enabled extensions
 *   - With a non-empty `env` block
 *   - That are NOT mcp-backed (mcp env goes through mcpServers)
 *   - That don't carry a credential pending consent (see `requiresConsent`)
 *
 * SecretRef values are looked up; refs with no value set are silently
 * skipped (don't poison the env with empty strings).
 *
 * Last-write-wins on collision. If two extensions declare the same env
 * var name, the later one (alphabetical by slug) overrides.
 */
export function resolveExtensionEnv(cwd?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ext of loadAllExtensions(cwd)) {
    if (!ext.config.env) continue;
    if (ext.config.mcp) continue; // mcp-backed env goes via mcpServers
    // A credential-bearing cli-bound extension is the same trust decision
    // as an mcp-backed one — withhold the whole binding until consented.
    if (requiresConsent(ext.config) && !hasConsent(ext)) continue;
    for (const [name, value] of Object.entries(ext.config.env)) {
      const resolved = resolveEnvValue(value, ext.scope, (key) => getSecret(ext.slug, key));
      // null = missing secret (skip silently for CLI-bound, no spawn block needed)
      // undefined = ${VAR} not set in environment (skip silently)
      if (resolved != null) out[name] = resolved;
    }
  }
  return out;
}
