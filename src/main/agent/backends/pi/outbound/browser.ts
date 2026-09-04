// Agent-driven browser tool: subprocess asks main to run a browser command
// against the session's pane (main owns the CDP connection, not the
// subprocess) and returns the output/screenshot.
import { executeBrowserToolCommand } from '../../../../browser/browser-tool-runtime';
import { send, type SubprocessHandle } from '../subprocess-handle';
import type { MsgBrowserToolRequest } from '../protocol';

export async function handleBrowserToolRequest(msg: MsgBrowserToolRequest, handle: SubprocessHandle): Promise<void> {
  try {
    const result = await executeBrowserToolCommand(msg.sessionId, msg.command);
    send(handle, {
      type: 'browser_tool_result',
      requestId: msg.requestId,
      output: result.output,
      imageBase64: result.imageBase64,
      imageMimeType: result.imageMimeType,
    });
  } catch (e) {
    send(handle, {
      type: 'browser_tool_result',
      requestId: msg.requestId,
      output: e instanceof Error ? e.message : String(e),
      isError: true,
    });
  }
}
