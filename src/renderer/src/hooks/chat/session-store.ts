// The per-session-id data that's shared across useChat's concerns (core
// streaming, checkpoints, auto-title). Refs touched by exactly one concern
// (plan cache, checkpoint timers, titled-set) stay local to their own hook
// instead of living here — see hooks/chat/use-plan-state.ts,
// use-checkpoints.ts, use-auto-title.ts.
import { useRef } from 'react';
import type { ChatMessage } from '@/lib/chat';
import type { SendArgs } from './types';

export interface SessionStore {
  /** App session id → its message list (source of truth while the tab is open). */
  messagesBySession: React.MutableRefObject<Map<string, ChatMessage[]>>;
  /** App session id → the turnId currently streaming into it, if any. */
  streamingBySession: React.MutableRefObject<Map<string, { turnId: string }>>;
  /** turnId → the app session id it belongs to (routes incoming events). */
  turnIdToSession: React.MutableRefObject<Map<string, string>>;
  /** App session id → the Pi SDK's resumable session id, once known. */
  sdkSessionIdBySession: React.MutableRefObject<Map<string, string>>;
  /** App session id → cached session title (avoids a disk round trip per render). */
  titleBySession: React.MutableRefObject<Map<string, string | undefined>>;
  /** App session id → the args + assistant message id of its last `send()`, for retry. */
  lastSendBySession: React.MutableRefObject<Map<string, { args: SendArgs; assistantId: string }>>;
  /** Dedup key set for compaction marker events already turned into a message. */
  seenCompactionEvents: React.MutableRefObject<Set<string>>;
}

export function useSessionStore(): SessionStore {
  const messagesBySession = useRef<Map<string, ChatMessage[]>>(new Map());
  const streamingBySession = useRef<Map<string, { turnId: string }>>(new Map());
  const turnIdToSession = useRef<Map<string, string>>(new Map());
  const sdkSessionIdBySession = useRef<Map<string, string>>(new Map());
  const titleBySession = useRef<Map<string, string | undefined>>(new Map());
  const lastSendBySession = useRef<Map<string, { args: SendArgs; assistantId: string }>>(
    new Map(),
  );
  const seenCompactionEvents = useRef<Set<string>>(new Set());

  return {
    messagesBySession,
    streamingBySession,
    turnIdToSession,
    sdkSessionIdBySession,
    titleBySession,
    lastSendBySession,
    seenCompactionEvents,
  };
}
