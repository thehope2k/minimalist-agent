import type { McpStatus } from './mcpStatus';

/** Compact badge describing why an mcp-backed extension's tools aren't loaded
 *  (or that they are). Returns null for non-mcp extensions or unknown status. */
export function McpStatusBadge({ status }: { status: McpStatus | undefined }) {
  if (!status || status.reason === 'disabled') return null;
  if (status.ok) {
    // toolCount is only known once some session has actually connected the
    // server — a stale, cross-session signal, not "live right now." It's
    // real information (proof the command/URL works, not just that
    // permissions are satisfied) but not a different state worth its own
    // color/label: either way, the extension is ready to use.
    const title =
      status.toolCount != null
        ? `Ready — connects on use, last verified with ${status.toolCount} tool(s)`
        : 'Ready — consent and secrets satisfied, connects on first use this session';
    return (
      <span
        className="rounded bg-emerald-500/15 px-1.5 py-px text-[10px] uppercase tracking-wide text-emerald-300"
        title={title}
      >
        ready
      </span>
    );
  }
  const label =
    status.reason === 'no-consent'
      ? 'consent'
      : status.reason === 'missing-secrets'
        ? 'secret'
        : 'failed';
  const title =
    status.reason === 'no-consent'
      ? 'MCP tools blocked: consent not granted. Open this extension to approve the server.'
      : status.reason === 'missing-secrets'
        ? 'MCP tools blocked: a required secret is not set.'
        : `MCP server failed to start${status.error ? `: ${status.error}` : ''}`;
  return (
    <span
      className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] uppercase tracking-wide text-amber-300"
      title={title}
    >
      {label}
    </span>
  );
}
