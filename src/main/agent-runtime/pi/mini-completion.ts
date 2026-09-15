// Isolated or session-bound one-shot model completions.
import { send, type SubprocessHandle } from './subprocess-handle';
import { ensureSubprocess, handles, killSubprocess, spawnSubprocess } from './chat-subprocess';
import type { ChatRequest, MiniCompletionRequest } from './agent';
import type { MsgMiniCompletion, MsgMiniCompletionResult } from './protocol';

/* ============================================================ */
/*  Public API: mini completion (title gen / cheap one-shots)    */
/* ============================================================ */

export async function runMiniCompletion(
  req: MiniCompletionRequest,
): Promise<{ text?: string; error?: string }> {
  const chatReq: ChatRequest = {
    connectionSlug: req.connectionSlug,
    auth: req.auth,
    turnId: 'mini',
    chatSessionId: req.chatSessionId,
    chatSessionPath: req.chatSessionPath,
    model: req.model,
    prompt: '',
    cwd: req.cwd,
  };

  // A different target model must not switch the session's live subprocess
  // mid-flight — use an isolated subprocess instead.
  const existing = handles.get(req.chatSessionPath);
  const wouldHijackLiveModel =
    !!existing && !existing.child.killed && !!req.model && req.model !== existing.currentModel;

  let handle: SubprocessHandle;
  try {
    handle = wouldHijackLiveModel ? spawnSubprocess(chatReq, '') : ensureSubprocess(chatReq, '');
    await handle.ready;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const requestId = `mini_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await new Promise<MsgMiniCompletionResult>((resolve) => {
      handle.pendingMini.set(requestId, { resolve });
      const m: MsgMiniCompletion = {
        type: 'mini_completion',
        requestId,
        systemPrompt: req.systemPrompt,
        userPrompt: req.userPrompt,
        model: req.model,
        maxTokens: req.maxTokens,
      };
      send(handle, m);
    });
    return {
      text: result.text,
      error: result.error,
    };
  } finally {
    if (wouldHijackLiveModel) killSubprocess(handle);
  }
}
