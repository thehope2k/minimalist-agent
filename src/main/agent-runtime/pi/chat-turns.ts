// Streaming chat turns and manual compaction over a persistent subprocess.
import { join } from 'node:path';
import type { AgentChatEvent } from '../events';
import { parseError } from '../errors';
import { buildPromptPrefix, buildSystemPromptAppend } from '../system-prompt';
import { extractSkillPaths, formatSkillDirective } from '../../skills/directive';
import { formatAttachmentsDirective } from '../attachments-directive';
import { EventQueue, send, type SubprocessHandle } from './subprocess-handle';
import { ensureSubprocess, handles } from './chat-subprocess';
import { ensureSessionScratchDir, resolveChatWorkingDirectory } from './chat-workspace';
import type { ChatRequest } from './agent';
import type { MsgManualCompact, MsgPrompt } from './protocol';

/* ============================================================ */
/*  Public API: chat turn                                        */
/* ============================================================ */

export async function* runChat(req: ChatRequest): AsyncGenerator<AgentChatEvent> {
  ensureSessionScratchDir(req.chatSessionPath);
  const request = {
    ...req,
    cwd: resolveChatWorkingDirectory(req.cwd, req.chatSessionPath),
  };

  // Compute append for subprocess init. May be empty on the very first turn
  // of a new session if initSessionState hasn't completed yet (race with the
  // React useEffect that fires after the send handler). Re-computed after
  // handle.ready to capture any state that settled during the spawn window.
  const initAppend = buildSystemPromptAppend({
    cwd: request.cwd,
    sessionId: request.chatSessionId,
    userMessage: request.prompt,
    authType: request.auth.type,
    provider: request.auth.provider,
    model: request.model,
    autonomyLevel: request.autonomyLevel,
  });
  const prefix = buildPromptPrefix({
    cwd: request.cwd,
    scratchDir: join(request.chatSessionPath, 'scratch'),
    sessionId: request.chatSessionId,
    pinnedAssets: request.pinnedAssets,
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
  } = extractSkillPaths(request.prompt, request.cwd);
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
    handle = ensureSubprocess(request, initAppend);
    await handle.ready;
  } catch (e) {
    yield { type: 'error', error: parseError(e) };
    return;
  }

  // Re-compute after ready: initSessionState may have completed during spawn.
  const append = buildSystemPromptAppend({
    cwd: request.cwd,
    sessionId: request.chatSessionId,
    userMessage: request.prompt,
    authType: request.auth.type,
    provider: request.auth.provider,
    model: request.model,
    autonomyLevel: request.autonomyLevel,
  });

  // Update mode in case the user changed it between turns.
  send(handle, { type: 'set_permission_mode', mode: request.permissionMode ?? 'auto' });

  // Register permission context for this turn.
  handle.permissionContext.set(request.turnId, {
    mode: request.permissionMode ?? 'auto',
    sessionId: request.chatSessionId,
    cwd: request.cwd,
  });
  if (request.signal) handle.turnSignals.set(request.turnId, request.signal);

  const queue = new EventQueue();
  handle.queues.set(request.turnId, queue);

  const finalPrompt = [prefix, directive, attachmentsDirective, cleanMessage]
    .filter(Boolean)
    .join('\n\n');
  const promptMsg: MsgPrompt = {
    type: 'prompt',
    turnId: request.turnId,
    message: finalPrompt,
    systemPromptAppend: append,
  };
  send(handle, promptMsg);

  const onAbort = () => {
    send(handle, { type: 'abort', turnId: request.turnId });
  };
  if (request.signal) {
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener('abort', onAbort, { once: true });
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
    if (request.signal) request.signal.removeEventListener('abort', onAbort);
    handle.permissionContext.delete(request.turnId);
    handle.turnSignals.delete(request.turnId);
  }
}

/* ============================================================ */
/*  Public API: manual compaction trigger                         */
/* ============================================================ */

/**
 * Triggers manual compaction via the persistent Pi subprocess for this chat
 * session, streaming compaction_start/compaction_end events through a
 * synthetic per-turn `EventQueue`, like {@link runChat} does for a real
 * turn. Rehydrates the subprocess when reopening a persisted session.
 */
export async function* runManualCompact(req: {
  chatSessionPath: string;
  turnId: string;
  customInstructions?: string;
  initialize?: ChatRequest;
  signal?: AbortSignal;
}): AsyncGenerator<AgentChatEvent> {
  let handle = handles.get(req.chatSessionPath);
  if (!handle || handle.child.killed) {
    if (!req.initialize) {
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

    try {
      const initAppend = buildSystemPromptAppend({
        cwd: req.initialize.cwd,
        sessionId: req.initialize.chatSessionId,
        userMessage: '',
        authType: req.initialize.auth.type,
        provider: req.initialize.auth.provider,
        model: req.initialize.model,
        autonomyLevel: req.initialize.autonomyLevel,
      });
      handle = ensureSubprocess(req.initialize, initAppend);
      await handle.ready;
    } catch (e) {
      yield { type: 'error', error: parseError(e) };
      return;
    }
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
