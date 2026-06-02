import { useEffect, useRef } from 'react';
import { getDraft, setDraft } from '@/lib/input-drafts';
import { getAttachmentDraft, setAttachmentDraft } from '@/lib/attachment-drafts';
import { patchNewSessionStateDraft } from '@/lib/new-session-draft';
import type { DraftAttachment } from '@/lib/electron';
import type { ModelPick } from './types';

/**
 * Per-session draft persistence. Saves text + attachments when switching
 * sessions; restores them when switching back. For the null session (fresh
 * chat), also snapshots the model picker so it survives navigation.
 */
export function useDraftPersistence(
  sessionId: string | null,
  value: string,
  attachments: DraftAttachment[],
  pickerOverride: ModelPick | null,
  onRestore: (text: string, attachments: DraftAttachment[]) => void,
) {
  const draftValueRef = useRef(value);
  draftValueRef.current = value;
  
  const draftAttachmentsRef = useRef(attachments);
  draftAttachmentsRef.current = attachments;
  
  const pickerOverrideRef = useRef(pickerOverride);
  pickerOverrideRef.current = pickerOverride;
  
  const draftPrevIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const prevId = draftPrevIdRef.current;
    
    if (prevId !== undefined) {
      // Save current drafts before switching
      setDraft(prevId, draftValueRef.current);
      setAttachmentDraft(prevId, draftAttachmentsRef.current);
      
      // Leaving the null slot → snapshot the picker
      if (prevId === null) {
        const pick = pickerOverrideRef.current;
        patchNewSessionStateDraft({
          connectionSlug: pick?.slug,
          modelId: pick?.modelId,
        });
      }
    }
    
    draftPrevIdRef.current = sessionId;
    
    // Restore drafts for the new session
    onRestore(getDraft(sessionId), getAttachmentDraft(sessionId));
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // intentionally excludes value/attachments — refs handle staleness
}
