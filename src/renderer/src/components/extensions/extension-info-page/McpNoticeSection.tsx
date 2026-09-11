export function McpNoticeSection({ slug }: { slug: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated-2 px-4 py-3 text-sm text-fg-muted">
      <strong className="text-fg">MCP-backed.</strong> The MCP server is
      spawned on demand by the agent subprocess and its
      tools appear to the agent as <code>mcp__{slug}__*</code>. A server
      that fails to start is skipped without blocking the session.
    </div>
  );
}
