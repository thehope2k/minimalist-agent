import { useState, useEffect, useRef, useCallback } from 'react';
import { branchSession } from '@/lib/sessions';
import { storedToDraft } from '@/lib/attachments';
import { setAttachmentDraft } from '@/lib/attachment-drafts';
import type { ChatMessage } from '@/lib/chat';

/**
 * Session branching logic. Stores the draft message and session ID
 * so the effect can fill the input on the branched session's first render.
 *
 * Text is carried via `pendingMessage`; attachments are seeded into the
 * per-session attachment-draft store so `useDraftPersistence` restores them
 * into the composer when the branched session mounts.
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
    async (messageId: string, withContext?: boolean) => {
      if (!sessionId) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg || msg.role !== 'user') return;
      const text = msg.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('');

      // Reconstruct the divergence message's attachments as composer drafts so
      // they travel with the text into the new thread. Done before navigation
      // so the store is populated when the branched session's input mounts.
      const drafts = (
        await Promise.all((msg.attachments ?? []).map((a) => storedToDraft(a)))
      ).filter((d): d is NonNullable<typeof d> => d !== null);

      const meta = await branchSession(sessionId, messageId, { withContext });
      if (!meta) return;
      // Store the draft + attachments BEFORE navigation
      setAttachmentDraft(meta.id, drafts);
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
