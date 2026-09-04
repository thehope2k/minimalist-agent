// Debounced checkpoint persistence. During a stream, every event mutates the
// in-memory bucket but only `turn_done` would otherwise hit disk — if the
// app is killed mid-turn the placeholder stays empty forever. This flushes
// the trailing assistant message every ~1s via `replaceLastMessage` so a
// kill-mid-turn loses at most that window; cancelled when the turn completes
// (the final state is written immediately by the caller instead).
import { useCallback, useEffect, useRef } from 'react';
import { chatToStored, partsToContent, type ChatMessage } from '@/lib/chat';
import { replaceLastMessage } from '@/lib/sessions';
import type { StoredMessage } from '@/lib/electron';

const CHECKPOINT_DEBOUNCE_MS = 1000;

export interface CheckpointStoreDeps {
  messagesBySession: React.MutableRefObject<Map<string, ChatMessage[]>>;
  streamingBySession: React.MutableRefObject<Map<string, { turnId: string }>>;
}

export function useCheckpoints(deps: CheckpointStoreDeps) {
  const { messagesBySession, streamingBySession } = deps;
  const checkpointTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const flushCheckpoint = useCallback(async (sid: string): Promise<void> => {
    const timer = checkpointTimers.current.get(sid);
    if (timer) {
      clearTimeout(timer);
      checkpointTimers.current.delete(sid);
    }
    const turnId = streamingBySession.current.get(sid)?.turnId;
    if (!turnId) return;
    const bucket = messagesBySession.current.get(sid);
    const msg = bucket?.find((m) => m.id === turnId);
    if (!msg) return;
    const stored: StoredMessage = chatToStored(msg);
    if (!stored.content) stored.content = partsToContent(msg.parts);
    try {
      await replaceLastMessage(sid, stored);
    } catch {
      /* transient — next checkpoint will catch up */
    }
  }, [messagesBySession, streamingBySession]);

  const scheduleCheckpoint = useCallback(
    (sid: string) => {
      if (checkpointTimers.current.has(sid)) return; // already pending
      const t = setTimeout(() => {
        void flushCheckpoint(sid);
      }, CHECKPOINT_DEBOUNCE_MS);
      checkpointTimers.current.set(sid, t);
    },
    [flushCheckpoint],
  );

  const flushAllCheckpoints = useCallback(async (): Promise<void> => {
    const ids = Array.from(checkpointTimers.current.keys());
    await Promise.all(ids.map((id) => flushCheckpoint(id)));
  }, [flushCheckpoint]);

  /** Cancels a pending debounced flush without performing it — used right
   *  before an authoritative final write (turn_done/error) makes the
   *  debounced version redundant. */
  const cancelPendingCheckpoint = useCallback((sid: string) => {
    const pending = checkpointTimers.current.get(sid);
    if (pending) {
      clearTimeout(pending);
      checkpointTimers.current.delete(sid);
    }
  }, []);

  // Expose a global so the main process can drive a synchronous-ish flush
  // through `webContents.executeJavaScript` from its `before-quit` handler.
  // Returns a Promise that executeJavaScript will await before resolving.
  useEffect(() => {
    (window as unknown as { __flushPendingChat?: () => Promise<void> })
      .__flushPendingChat = flushAllCheckpoints;
    return () => {
      delete (window as unknown as { __flushPendingChat?: () => Promise<void> })
        .__flushPendingChat;
    };
  }, [flushAllCheckpoints]);

  return { flushCheckpoint, scheduleCheckpoint, flushAllCheckpoints, cancelPendingCheckpoint };
}
