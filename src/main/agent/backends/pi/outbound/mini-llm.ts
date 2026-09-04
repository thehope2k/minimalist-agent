// Resolves pending main→subprocess round trips for one-shot completions:
// `mini_completion` (title gen / cheap completions) and `llm_query` (the
// call_llm tool's backend), keyed by requestId in the handle's pending maps.
import type { SubprocessHandle } from '../subprocess-handle';
import type { MsgLlmQueryResult, MsgMiniCompletionResult } from '../protocol';

export function handleMiniCompletionResult(msg: MsgMiniCompletionResult, handle: SubprocessHandle): void {
  const p = handle.pendingMini.get(msg.requestId);
  if (p) {
    handle.pendingMini.delete(msg.requestId);
    p.resolve(msg);
  }
}

export function handleLlmQueryResult(msg: MsgLlmQueryResult, handle: SubprocessHandle): void {
  const p = handle.pendingLlm.get(msg.requestId);
  if (p) {
    handle.pendingLlm.delete(msg.requestId);
    p.resolve(msg);
  }
}
