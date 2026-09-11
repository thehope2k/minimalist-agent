// Per-server tool allowlisting for MCP-backed extensions. Enforced through
// the runtime's `pre_tool_use_request` gate.

import { loadExtensionBySlug } from './storage';
import { isToolBlocked, parseMcpToolName } from './types';

/** Whether `fullToolName` (e.g. `mcp__linear__delete_issue`) is blocked by
 * its extension's `permissions.blockedTools`. Anything that isn't a
 * recognized MCP tool name, or whose extension isn't found, is never
 * blocked here — this function only narrows, never widens, what's allowed. */
export function isMcpToolNameBlocked(fullToolName: string, cwd?: string): boolean {
  const parsed = parseMcpToolName(fullToolName);
  if (!parsed) return false;
  const ext = loadExtensionBySlug(parsed.slug, cwd);
  if (!ext) return false;
  return isToolBlocked(ext.config, parsed.tool);
}
