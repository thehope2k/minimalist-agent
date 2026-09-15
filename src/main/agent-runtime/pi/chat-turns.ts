// Streaming chat turns and manual compaction over a persistent subprocess.
import { join } from 'node:path';
import type { AgentChatEvent } from '../events';
import { parseError } from '../errors';
import { buildPromptPrefix, buildSystemPromptAppend } from '../system-prompt';
import { extractSkillPaths, formatSkillDirective } from '../../skills/directive';
import { formatAttachmentsDirective } from '../attachments-directive';
import { EventQueue, send, type SubprocessHandle } from './subprocess-handle';
import { ensureSubprocess, handles } from './chat-subprocess';
import type { ChatRequest } from './agent';
import type { MsgManualCompact, MsgPrompt } from './protocol';

/* ============================================================ */
/*  Public API: chat turn                                        */
/* ============================================================ */

export async function* runChat(req: ChatRequest): AsyncGenerator<AgentChatEvent> {
  // Compute append for subprocess init. May be empty on the very first turn
  // of a new session if initSessionState hasn't completed yet (race with the
  // React useEffect that fires after the send handler). Re-computed after
  // handle.ready to capture any state that settled during the spawn window.
  const initAppend = buildSystemPromptAppend({
    cwd: req.cwd,
    sessionId: req.chatSessionId,
    userMessage: req.prompt,
    authType: req.auth.type,
    provider: req.auth.provider,
    model: req.model,
    autonomyLevel: req.autonomyLevel,
  });
  const prefix = buildPromptPrefix({
    cwd: req.cwd,
    scratchDir: join(req.chatSessionPath, 'scratch'),
    sessionId: req.chatSessionId,
    pinnedAssets: req.pinnedAssets,
  });

  // Resolve `@slug` / `@path` mentions.
  const {
    skillPaths,
    extensionGuidePaths,
    filePaths,
    folderPaths,
    cleanMessage,
    missingSkills,
    missingFiles,
  } = extractSkillPaths(req.prompt, req.cwd);
  if (missingSkills.length > 0) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          `Mention(s) not found: ${missingSkills.join(', ')}. ` +
            `Skills live under ~/.agents/skills/<slug>/ or <cwd>/.agents/skills/<slug>/. ` +
            `Extensions must be installed and enabled.`,
        ),
      ),
    };
    return;
  }
  if (missingFiles.length > 0) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          `File mention(s) not found: ${missingFiles.join(', ')}. ` +
            `Paths must be relative to the working directory (e.g. @docs/ROADMAP.md).`,
        ),
      ),
    };
    return;
  }
  const directive = formatSkillDirective(skillPaths, extensionGuidePaths, filePaths, folderPaths);
  const attachmentsDirective = formatAttachmentsDirective(req.attachments);

  let handle: SubprocessHandle;
  try {
    handle = ensureSubprocess(req, initAppend);
    await handle.ready;
  } catch (e) {
    yield { type: 'error', error: parseError(e) };
    return;
  }

  // Re-compute after ready: initSessionState may have completed during spawn.
  const append = buildSystemPromptAppend({
    cwd: req.cwd,
    sessionId: req.chatSessionId,
    userMessage: req.prompt,
    authType: req.auth.type,
    provider: req.auth.provider,
    model: req.model,
    autonomyLevel: req.autonomyLevel,
  });

  // Update mode in case the user changed it between turns.
  send(handle, { type: 'set_permission_mode', mode: req.permissionMode ?? 'auto' });

  // Register permission context for this turn.
  handle.permissionContext.set(req.turnId, {
    mode: req.permissionMode ?? 'auto',
    sessionId: req.chatSessionId,
    cwd: req.cwd,
  });
  if (req.signal) handle.turnSignals.set(req.turnId, req.signal);

  const queue = new EventQueue();
  handle.queues.set(req.turnId, queue);

  const finalPrompt = [prefix, directive, attachmentsDirective, cleanMessage]
    .filter(Boolean)
    .join('\n\n');
  const promptMsg: MsgPrompt = {
    type: 'prompt',
    turnId: req.turnId,
    message: finalPrompt,
    systemPromptAppend: append,
  };
  send(handle, promptMsg);

  const onAbort = () => {
    send(handle, { type: 'abort', turnId: req.turnId });
  };
  if (req.signal) {
    if (req.signal.aborted) onAbort();
    else req.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    for (;;) {
      const ev = await queue.next();
      if (!ev) {
        yield { type: 'turn_done' };
        return;
      }
      yield ev;
      if (ev.type === 'turn_done' || ev.type === 'error') return;
    }
  } finally {
    if (req.signal) req.signal.removeEventListener('abort', onAbort);
    handle.permissionContext.delete(req.turnId);
    handle.turnSignals.delete(req.turnId);
  }
}

/* ============================================================ */
/*  Public API: manual compaction trigger                         */
/* ============================================================ */

/**
 * Triggers manual compaction via the persistent Pi subprocess for this chat
 * session, streaming compaction_start/compaction_end events through a
 * synthetic per-turn `EventQueue`, like {@link runChat} does for a real
 * turn. Requires a live subprocess for this session.
 */
export async function* runManualCompact(req: {
  chatSessionPath: string;
  turnId: string;
  customInstructions?: string;
  signal?: AbortSignal;
}): AsyncGenerator<AgentChatEvent> {
  const handle = handles.get(req.chatSessionPath);
  if (!handle || handle.child.killed) {
    yield {
      type: 'error',
      error: {
        code: 'unknown_error',
        title: 'No active session',
        message:
          'Start a chat turn before compacting — there is no running session to compact yet.',
        canRetry: false,
      },
    };
    return;
  }

  const queue = new EventQueue();
  handle.queues.set(req.turnId, queue);
  if (req.signal) handle.turnSignals.set(req.turnId, req.signal);

  const msg: MsgManualCompact = {
    type: 'manual_compact',
    turnId: req.turnId,
    customInstructions: req.customInstructions,
  };
  send(handle, msg);

  const onAbort = () => {
    send(handle, { type: 'abort', turnId: req.turnId });
  };
  if (req.signal) {
    if (req.signal.aborted) onAbort();
    else req.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    for (;;) {
      const ev = await queue.next();
      if (!ev) {
        yield { type: 'turn_done' };
        return;
      }
      yield ev;
      if (ev.type === 'turn_done' || ev.type === 'error') return;
    }
  } finally {
    if (req.signal) req.signal.removeEventListener('abort', onAbort);
    handle.queues.delete(req.turnId);
    handle.turnSignals.delete(req.turnId);
  }
}
