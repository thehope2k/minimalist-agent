// Mid-session auth: `session_id_update` (transcript id rotation),
// `auth_refresh_request` (subprocess-initiated round trip for a mid-turn
// refresh), and `auth_required` (subprocess hit an auth failure — refresh
// once and surface a retry-able error to the active turn, no auto-retry).
import { resolveAuthForSlug } from '../../../../auth/resolve';
import { createLogger } from '../../../../logger';
import { send, type SubprocessHandle } from '../subprocess-handle';
import { persistPiSessionId } from './lifecycle';
import type {
  MsgAuthRefreshRequest,
  MsgAuthRefreshResult,
  MsgAuthRequired,
  MsgSessionIdUpdate,
  MsgTokenUpdate,
} from '../protocol';

const log = createLogger('pi');

export function handleSessionIdUpdate(msg: MsgSessionIdUpdate, handle: SubprocessHandle): void {
  persistPiSessionId(handle.chatSessionId, msg.piSessionId);
}

export async function handleAuthRefreshRequest(msg: MsgAuthRefreshRequest, handle: SubprocessHandle): Promise<void> {
  const signal = msg.turnId ? handle.turnSignals.get(msg.turnId) : undefined;
  try {
    const fresh = await resolveAuthForSlug(handle.connectionSlug, signal, `session=${handle.chatSessionId}`);
    const result: MsgAuthRefreshResult =
      fresh.type === 'copilot_oauth'
        ? {
            type: 'auth_refresh_result',
            requestId: msg.requestId,
            credential: {
              access: fresh.accessToken,
              refresh: fresh.refreshToken ?? '',
              expires: fresh.expiresAt,
            },
          }
        : {
            type: 'auth_refresh_result',
            requestId: msg.requestId,
            error: `Connection "${handle.connectionSlug}" has no OAuth credential to refresh`,
          };
    send(handle, result);
  } catch (e) {
    send(handle, {
      type: 'auth_refresh_result',
      requestId: msg.requestId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function handleAuthRequired(msg: MsgAuthRequired, handle: SubprocessHandle): Promise<void> {
  // Refresh once, push token_update; we don't auto-retry the turn
  // (Pi already errored it). The user can re-send.
  if (handle.refreshing) return;
  handle.refreshing = true;
  try {
    const fresh = await resolveAuthForSlug(handle.connectionSlug, undefined, `session=${handle.chatSessionId}`);
    if (fresh.type === 'copilot_oauth') {
      const upd: MsgTokenUpdate = {
        type: 'token_update',
        credential: handle.piAuthProvider === 'github-copilot'
          ? {
              type: 'oauth',
              access: fresh.accessToken,
              refresh: fresh.refreshToken ?? '',
              expires: fresh.expiresAt,
            }
          : {
              type: 'api_key',
              key: fresh.accessToken,
            },
      };
      send(handle, upd);
    }
  } catch (e) {
    log.error('token refresh failed:', e);
  } finally {
    handle.refreshing = false;
  }
  // Surface to the active turn so the UI shows a retry-able error.
  if (msg.turnId) {
    const q = handle.queues.get(msg.turnId);
    if (q) {
      const isChatGpt = handle.piAuthProvider === 'openai-codex';
      q.push({
        type: 'error',
        error: {
          code: 'expired_oauth_token',
          title: isChatGpt ? 'ChatGPT Plus session expired' : 'GitHub Copilot session expired',
          message: isChatGpt
            ? 'Your ChatGPT Plus token was refreshed. Re-send the message to continue.'
            : 'Your Copilot token was refreshed. Re-send the message to continue.',
          canRetry: true,
          originalError: msg.message,
        },
      });
      q.finish();
      handle.queues.delete(msg.turnId);
    }
  }
}
