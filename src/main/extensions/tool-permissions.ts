// Per-server tool allowlisting for MCP-backed extensions. Enforced
// identically on both backends: Anthropic via `disallowedTools`, Pi via the
// existing `pre_tool_use_request` gate.

import { loadAllExtensions, loadExtensionBySlug } from './storage';
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

/**
 * Fully-qualified `mcp__<slug>__<tool>` names to pass as `disallowedTools`
 * for the Anthropic backend \u2014 one entry per blocked tool, across every
 * mcp-backed extension that declares `permissions.blockedTools`.
 */
export function collectBlockedMcpToolNames(cwd?: string): string[] {
  const out: string[] = [];
  for (const ext of loadAllExtensions(cwd)) {
    const blocked = ext.config.permissions?.blockedTools;
    if (!ext.config.mcp || !blocked || blocked.length === 0) continue;
    for (const tool of blocked) out.push(`mcp__${ext.slug}__${tool}`);
  }
  return out;
}
