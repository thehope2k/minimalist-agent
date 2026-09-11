// Runtime connection status for mcp-backed extensions (as opposed to the
// config-level status `extensions:mcp.status` IPC reports) — cached so the
// panel reflects live connect failures, and forwarded to the renderer.
import { BrowserWindow } from 'electron';
import { recordMcpStatus } from '../../../extensions/mcp-config';
import { createLogger } from '../../../logger';
import type { SubprocessHandle } from '../subprocess-handle';
import type { MsgMcpStatus } from '../protocol';

const log = createLogger('chat-runtime');

export function handleMcpStatus(msg: MsgMcpStatus, handle: SubprocessHandle): void {
  const sessionId = msg.sessionId ?? handle.chatSessionId;
  const servers = msg.servers;
  recordMcpStatus(servers);
  for (const s of servers) {
    if (s.ok) {
      log.info(`MCP ${s.slug} connected (${s.toolCount ?? 0} tool(s))`);
    } else {
      log.warn(`MCP ${s.slug} failed: ${s.error ?? 'unknown error'}`);
    }
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('mcp-status', { sessionId, servers });
  }
}
