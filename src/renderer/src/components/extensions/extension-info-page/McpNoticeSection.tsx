export function McpNoticeSection({ slug }: { slug: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated-2 px-4 py-3 text-sm text-fg-muted">
      <strong className="text-fg">MCP-backed.</strong> At session start, the agent subprocess
      launches (stdio) or connects to (HTTP) this server, and its tools appear as{' '}
      <code>mcp__{slug}__*</code>. A server that fails to connect, or uses an unsupported transport
      (SSE), is skipped without blocking the session.
    </div>
  );
}
