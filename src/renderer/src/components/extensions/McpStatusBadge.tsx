import type { McpStatus } from './mcpStatus';

/** Compact badge describing why an mcp-backed extension's tools aren't loaded
 *  (or that they are). Returns null for non-mcp extensions or unknown status. */
export function McpStatusBadge({ status }: { status: McpStatus | undefined }) {
  if (!status || status.reason === 'disabled') return null;
  if (status.ok) {
    // toolCount is only known after a session actually connects the server.
    // Until then the extension is merely eligible ("ready"), not verified
    // — consent/secrets can be satisfied while the server still fails to
    // start or authenticate on first real use.
    const connected = status.toolCount != null;
    return (
      <span
        className={
          connected
            ? 'rounded bg-emerald-500/15 px-1.5 py-px text-[10px] uppercase tracking-wide text-emerald-300'
            : 'rounded bg-elevated/80 px-1.5 py-px text-[10px] uppercase tracking-wide text-fg-subtle'
        }
        title={
          connected
            ? `MCP server connected — ${status.toolCount} tool(s)`
            : 'Eligible: consent and secrets satisfied. The server connects on first use this session.'
        }
      >
        {connected ? 'active' : 'ready'}
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
