// In-memory per-session attachment draft store.
//
// Mirrors the text-draft pattern from input-drafts.ts.
// DraftAttachment is plain-serialisable (base64 strings, no File/Blob handles)
// so it's safe to keep in a module-level Map for the lifetime of the renderer.

import type { DraftAttachment } from './electron';

const drafts = new Map<string | null, DraftAttachment[]>();

export function getAttachmentDraft(sessionId: string | null): DraftAttachment[] {
  return drafts.get(sessionId) ?? [];
}

export function setAttachmentDraft(
  sessionId: string | null,
  attachments: DraftAttachment[],
): void {
  if (attachments.length > 0) {
    drafts.set(sessionId, attachments);
  } else {
    drafts.delete(sessionId);
  }
}
