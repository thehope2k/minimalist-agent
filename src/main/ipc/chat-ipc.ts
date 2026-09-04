import { ipcMain } from 'electron';
import type { StoredAttachment } from '../storage/sessions';
import { sessionPath, loadSession } from '../storage/sessions';
import { resolveAuthForSlug } from '../auth/resolve';
import { runAgentChat } from '../agent/runner';
import { steerAnthropicTurn } from '../agent/backends/anthropic';
import { steerPiTurn, runPiManualCompact } from '../agent/backends/pi/agent';
import { generateTitle } from '../agent/title';
import { parseError } from '../agent/errors';
import { getSettings, type PermissionMode, type ThinkingLevel } from '../storage/settings';
import { listConnections } from '../storage/connections';
import { maybeRevalidate } from '../storage/model-refresh';
import type { EngagementRequest, EngagementResponse } from '../../shared/collaboration-types';

export interface ChatSendRequest {
  /** Caller-provided id used to correlate streamed events to a UI message. */
  id: string;
  /**
   * Connection slug - main resolves it into a fresh `AnthropicAuth`
   * server-side (refreshing OAuth tokens if needed). The renderer never
   * touches the access token directly. See `src/main/auth/resolve.ts`.
   */
  connectionSlug: string;
  model: string;
  prompt: string;
  /** Working directory for the SDK subprocess. */
  cwd?: string;
  /** Resume the SDK session for multi-turn continuity. */
  resumeSessionId?: string;
  /** Bound for tool-use loops in this turn. */
  maxTurns?: number;
  /** Permission mode for this turn ('plan' | 'auto'). */
  permissionMode?: PermissionMode;
  /**
   * Owning session id - required so per-session "Allow for session"
   * approvals can be remembered across turns. Optional only because the
   * very first send happens before the renderer has called sessions:create;
   * useChat.ts always provides it once the session exists.
   */
  sessionId?: string;
  /** Already-stored attachments for this turn. */
  attachments?: StoredAttachment[];
}

const inFlight = new Map<string, AbortController>();

/** Without this registration, `chat:abort` has no controller to look up
 *  for `id` and silently no-ops. */
async function withAbortable(
  id: string,
  fn: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const ctrl = new AbortController();
  inFlight.set(id, ctrl);
  try {
    await fn(ctrl.signal);
  } finally {
    inFlight.delete(id);
  }
}

/**
 * Per-turn routing info so `chat:steer` knows which backend to call.
 * Cleared in the same `finally` that clears inFlight.
 */
interface TurnInfo {
  providerType: 'anthropic' | 'pi';
  /** For Pi turns - used to find the right subprocess. */
  chatSessionId?: string;
}
const turnInfo = new Map<string, TurnInfo>();

/**
 * Pending permission prompts - one entry per outstanding renderer round
 * trip. Keyed by reqId; cleared on response, abort, or window close.
 *
 * Pending collaboration prompts (RequestDecision, RequestPreference, etc.).
 * Handles intelligent engagement system where LLM decides when to collaborate.
 */
const pendingCollaborations = new Map<
  string,
  { resolve: (r: EngagementResponse) => void; turnId: string }
>();

/** Chat turn streaming: send/steer/abort/manual-compaction/title generation. */
export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (event, req: ChatSendRequest) => {
    if (!req?.id) throw new Error('Missing request id.');

    const ctrl = new AbortController();
    inFlight.set(req.id, ctrl);

    // Renderer-round-trip for collaboration engagement.
    // Used by RequestDecision, RequestPreference, RequestFeedback,
    // RequestGuidance, and RequestApproval tools.
    const askCollaboration = (ereq: EngagementRequest) => {
      if (event.sender.isDestroyed()) {
        return Promise.reject(new Error('Window destroyed'));
      }
      return new Promise<EngagementResponse>((resolve, reject) => {
        pendingCollaborations.set(ereq.reqId, {
          resolve,
          turnId: ereq.turnId,
        });
        const onAbort = () => {
          pendingCollaborations.delete(ereq.reqId);
          reject(new Error('Turn aborted'));
        };
        if (ctrl.signal.aborted) {
          onAbort();
          return;
        }
        ctrl.signal.addEventListener('abort', onAbort, { once: true });
        event.sender.send('chat:collaboration-request', ereq);
      });
    };

    try {
      let auth;
      try {
        auth = await resolveAuthForSlug(req.connectionSlug, ctrl.signal);
      } catch (e) {
        const aborted = e instanceof Error && e.message === 'Aborted';
        if (!aborted && !event.sender.isDestroyed()) {
          event.sender.send('chat:event', {
            id: req.id,
            type: 'error',
            error: parseError(e),
          });
        }
        return;
      }

      turnInfo.set(req.id, {
        providerType: auth.type === 'copilot_oauth' ? 'pi' : 'anthropic',
        chatSessionId: req.sessionId,
      });

      // On-use revalidation: TTL-gated, fire-and-forget. Keeps an actively
      // used connection's model catalog fresh without waiting for a restart.
      maybeRevalidate(req.connectionSlug);

      // Ensure session state is ready before the first turn.
      // This is a no-op on subsequent turns (init is idempotent when state already exists).
      let autonomyLevel = 50; // Default: balanced
      let pinnedAssets: string[] | undefined;
      let sessionThinkingLevel: ThinkingLevel | undefined;
      if (req.sessionId) {
        const sessionMeta = loadSession(req.sessionId)?.meta;
        autonomyLevel = sessionMeta?.autonomyLevel ?? 50;
        pinnedAssets = sessionMeta?.pinnedAssets;
        sessionThinkingLevel = sessionMeta?.thinkingLevel;
      }

      const { defaultThinking } = getSettings();
      const thinkingLevel = sessionThinkingLevel ?? defaultThinking;

      for await (const chunk of runAgentChat({
        auth,
        connectionSlug: req.connectionSlug,
        piAuthProvider: listConnections().find((c) => c.slug === req.connectionSlug)?.piAuthProvider,
        turnId: req.id,
        chatSessionId: req.sessionId,
        model: req.model,
        prompt: req.prompt,
        attachments: req.attachments,
        cwd: req.cwd,
        resumeSessionId: req.resumeSessionId,
        maxTurns: req.maxTurns,
        permissionMode: req.permissionMode,
        thinkingLevel,
        askCollaboration,
        autonomyLevel,
        pinnedAssets,
        signal: ctrl.signal,
      })) {
        if (event.sender.isDestroyed()) break;
        event.sender.send('chat:event', { id: req.id, ...chunk });
        if (chunk.type === 'turn_done' || chunk.type === 'error') break;
      }
    } finally {
      // Resolve any outstanding collaboration prompts for this turn.
      for (const [reqId, entry] of pendingCollaborations) {
        if (entry.turnId === req.id) {
          entry.resolve({
            reqId,
            decision: 'denied',
            custom_response: 'Turn aborted',
          });
          pendingCollaborations.delete(reqId);
        }
      }
      inFlight.delete(req.id);
      turnInfo.delete(req.id);
    }
  });

  ipcMain.handle(
    'chat:steer',
    async (
      _e,
      args: { turnId: string; message: string; attachments?: StoredAttachment[] },
    ): Promise<{ ok: boolean; reason?: string }> => {
      const info = turnInfo.get(args.turnId);
      if (!info) return { ok: false, reason: 'turn_not_active' };
      if (!args.message.trim() && !args.attachments?.length)
        return { ok: false, reason: 'empty_message' };
      if (info.providerType === 'pi') {
        if (!info.chatSessionId) return { ok: false, reason: 'no_session' };
        const ok = steerPiTurn({
          chatSessionPath: sessionPath(info.chatSessionId),
          turnId: args.turnId,
          message: args.message,
          attachments: args.attachments,
        });
        return ok ? { ok: true } : { ok: false, reason: 'subprocess_unavailable' };
      }
      const ok = steerAnthropicTurn(args.turnId, args.message, args.attachments);
      return ok ? { ok: true } : { ok: false, reason: 'turn_not_steerable' };
    },
  );

  ipcMain.handle('chat:abort', (_e, id: string) => {
    const ctrl = inFlight.get(id);
    if (ctrl) {
      ctrl.abort();
      inFlight.delete(id);
    }
  });

  ipcMain.handle(
    'chat:manualCompact',
    async (
      event,
      args: { turnId: string; sessionId: string; connectionSlug: string; customInstructions?: string },
    ): Promise<void> => {
      const conn = listConnections().find((c) => c.slug === args.connectionSlug);
      if (conn?.providerType === 'anthropic') {
        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:event', {
            id: args.turnId,
            type: 'error',
            error: {
              code: 'unknown_error',
              title: 'Not supported',
              message: 'Manual compaction is only available for Pi-backed connections (GitHub Copilot, local, OpenAI-compatible).',
              canRetry: false,
            },
          });
        }
        return;
      }

      await withAbortable(args.turnId, async (signal) => {
        for await (const chunk of runPiManualCompact({
          chatSessionPath: sessionPath(args.sessionId),
          turnId: args.turnId,
          customInstructions: args.customInstructions,
          signal,
        })) {
          if (event.sender.isDestroyed()) break;
          event.sender.send('chat:event', { id: args.turnId, ...chunk });
          if (chunk.type === 'turn_done' || chunk.type === 'error') break;
        }
      });
    },
  );

  ipcMain.handle(
    'chat:generateTitle',
    async (
      _e,
      args: {
        connectionSlug: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        model?: string;
        sessionId?: string;
        cwd?: string;
      },
    ): Promise<string | null> => {
      const auth = await resolveAuthForSlug(args.connectionSlug);
      const connMeta = listConnections().find((c) => c.slug === args.connectionSlug);
      return generateTitle({
        auth,
        messages: args.messages,
        model: args.model,
        connectionSlug: args.connectionSlug,
        chatSessionId: args.sessionId,
        piAuthProvider: connMeta?.piAuthProvider,
        cwd: args.cwd,
      });
    },
  );

  /**
   * Renderer's response to a `chat:collaboration-request` event.
   * Used by intelligent collaboration system (RequestDecision, etc.).
   */
  ipcMain.handle(
    'chat:collaboration-response',
    (_e, payload: EngagementResponse) => {
      const entry = pendingCollaborations.get(payload.reqId);
      if (!entry) return;
      entry.resolve(payload);
      pendingCollaborations.delete(payload.reqId);
    },
  );
}
