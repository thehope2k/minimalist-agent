import { useState, useEffect, useRef, useCallback } from 'react';
import { branchSession } from '@/lib/sessions';
import type { ChatMessage } from '@/lib/chat';

/**
 * Session branching logic. Stores the draft message and session ID
 * so the effect can fill the input on the branched session's first render.
 */
export function useBranchSession(
  sessionId: string | null,
  messages: ChatMessage[],
  onSessionCreated: (id: string) => void,
) {
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);
  const pendingBranchDraftRef = useRef<{ sessionId: string; text: string } | null>(null);

  useEffect(() => {
    const draft = pendingBranchDraftRef.current;
    if (draft && draft.sessionId === sessionId) {
      setPendingMessage(draft.text);
      pendingBranchDraftRef.current = null;
    }
  }, [sessionId]);

  const handleBranch = useCallback(
    async (messageId: string) => {
      if (!sessionId) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg || msg.role !== 'user') return;
      const text = msg.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('');
      const meta = await branchSession(sessionId, messageId);
      if (!meta) return;
      // Store the draft BEFORE navigation
      pendingBranchDraftRef.current = { sessionId: meta.id, text };
      onSessionCreated(meta.id);
    },
    [sessionId, messages, onSessionCreated],
  );

  return {
    pendingMessage,
    setPendingMessage,
    handleBranch,
  };
}
