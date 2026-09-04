// Turn lifecycle: subprocess `ready`, watchdog operation labels, per-turn
// event forwarding, and fatal subprocess-level errors.
import { parseError } from '../../../errors';
import { updateSessionMeta } from '../../../../storage/sessions';
import { createLogger } from '../../../../logger';
import type { SubprocessHandle } from '../subprocess-handle';
import type { MsgEvent, MsgReady } from '../protocol';

const log = createLogger('pi');

/** Persists the Pi SDK's transcript-file id on session meta, stable for a
 *  session's lifetime unless an extension forks/rotates it mid-conversation. */
export function persistPiSessionId(chatSessionId: string, piSessionId: string): void {
  try {
    updateSessionMeta(chatSessionId, { sdkSessionId: piSessionId });
  } catch (e) {
    log.error('failed to persist piSessionId:', e);
  }
}

export function handleReady(
  msg: MsgReady,
  handle: SubprocessHandle,
  resolveReady: () => void,
): void {
  if (msg.piSessionId) persistPiSessionId(handle.chatSessionId, msg.piSessionId);
  resolveReady();
}

export function handleOperationUpdate(msg: { operation?: string }, handle: SubprocessHandle): void {
  handle.currentOperation = msg.operation;
}

export function handleEvent(msg: MsgEvent, handle: SubprocessHandle): void {
  const q = handle.queues.get(msg.turnId);
  if (!q) return;
  q.push(msg.event);
  if (msg.event.type === 'turn_done' || msg.event.type === 'error') {
    q.finish();
    handle.queues.delete(msg.turnId);
    handle.permissionContext.delete(msg.turnId);
  }
}

export function handleSubprocessFatalError(
  msg: { message: string },
  handle: SubprocessHandle,
  rejectReady: (e: Error) => void,
): void {
  for (const q of handle.queues.values()) {
    q.push({ type: 'error', error: parseError(new Error(msg.message)) });
    q.finish();
  }
  handle.queues.clear();
  rejectReady(new Error(msg.message));
}
