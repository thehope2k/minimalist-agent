// Resolves pending main→subprocess `mini_completion` round trips (title gen /
// cheap completions), keyed by requestId in the handle's pending map.
import type { SubprocessHandle } from '../subprocess-handle';
import type { MsgMiniCompletionResult } from '../protocol';

export function handleMiniCompletionResult(
  msg: MsgMiniCompletionResult,
  handle: SubprocessHandle,
): void {
  const p = handle.pendingMini.get(msg.requestId);
  if (p) {
    handle.pendingMini.delete(msg.requestId);
    p.resolve(msg);
  }
}
