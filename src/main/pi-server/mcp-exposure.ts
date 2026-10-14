import type { McpServerConfig } from '../agent-runtime/pi/protocol';
import type { McpServerDiagnostic } from './mcp-diagnostics';

// Below this, declaring every tool costs less than the extra tool_search round trip.
export const DEFERRED_TOOL_THRESHOLD = 20;

// An author-set `exposure` always wins. A server whose tool count is unknown
// (probe skipped or failed) stays direct rather than gambling on deferral.
export function applyAutoExposure(
  configs: McpServerConfig[],
  diagnostics: McpServerDiagnostic[],
): McpServerConfig[] {
  const toolCounts = new Map(diagnostics.map((d) => [d.slug, d.toolCount]));
  return configs.map((cfg) => {
    if (cfg.exposure !== undefined) return cfg;
    const toolCount = toolCounts.get(cfg.slug) ?? 0;
    return toolCount > DEFERRED_TOOL_THRESHOLD ? { ...cfg, exposure: 'deferred' } : cfg;
  });
}
