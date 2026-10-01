// Per-server tool allowlisting for MCP-backed extensions. Enforced through
// the runtime's `pre_tool_use_request` gate.

import { loadAllExtensions } from './storage';
import { isToolBlocked, mcpSlugMatches, parseMcpToolName } from './types';

/** Whether `fullToolName` (e.g. `mcp__linear__delete_issue`) is blocked by
 * its extension's `permissions.blockedTools`. Anything that isn't a
 * recognized MCP tool name, or whose extension isn't found, is never
 * blocked here — this function only narrows, never widens, what's allowed.
 *
 * Matches by slug rather than a direct by-slug lookup because native MCP
 * sanitizes the slug segment of qualified tool names (hyphens become `_`),
 * so the literal segment in `fullToolName` doesn't always equal the
 * extension's own slug — see `mcpSlugMatches`. */
export function isMcpToolNameBlocked(fullToolName: string, cwd?: string): boolean {
  const parsed = parseMcpToolName(fullToolName);
  if (!parsed) return false;
  const ext = loadAllExtensions(cwd).find(
    (e) => e.config.mcp && mcpSlugMatches(parsed.slug, e.slug),
  );
  if (!ext) return false;
  return isToolBlocked(ext.config, parsed.tool);
}
