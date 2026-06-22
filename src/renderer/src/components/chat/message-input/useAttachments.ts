import { useState, useRef } from 'react';
import {
  fileToDraft,
  pickAttachments,
  readAttachmentPath,
  createSnippetDraft,
} from '@/lib/attachments';
import type { DraftAttachment, ConnectionMeta } from '@/lib/electron';

/**
 * Attachment state management, including file picker, drag-drop, paste,
 * and vision model validation.
 */
export function useAttachments(
  connection: ConnectionMeta | null,
  model: string | null,
) {
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const addDrafts = (drafts: DraftAttachment[]) => {
    if (drafts.length > 0) setAttachments((prev) => [...prev, ...drafts]);
  };

  const clearAttachments = () => setAttachments([]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateAttachment = (index: number, updated: DraftAttachment) => {
    setAttachments((prev) => prev.map((a, idx) => (idx === index ? updated : a)));
  };

  // Check if current model supports vision
  const currentModelDef = connection?.models.find((m) => m.id === model);
  const supportsVision = currentModelDef?.supportsVision ?? false;

  // Images stay in the draft even on a non-vision model (so switching models
  // restores them); we just won't send them. This flag drives the
  // strike-through UI + inline notice.
  const hasUnsendableImages =
    !supportsVision && attachments.some((a) => a.type === 'image');

  const visionSuggestion = () => {
    const visionModels = connection?.models.filter((m) => m.supportsVision) ?? [];
    return visionModels.length > 0
      ? ` Switch to ${visionModels
          .slice(0, 2)
          .map((m) => m.shortName || m.name)
          .join(' or ')} to include them.`
      : '';
  };

  const handlePickFiles = async () => {
    setError(null);
    try {
      const drafts = await pickAttachments();
      addDrafts(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read files.');
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    setError(null);

    const dropped = Array.from(e.dataTransfer.files) as Array<File & { path?: string }>;
    if (dropped.length === 0) return;

    setLoadingCount(dropped.length);
    try {
      const out: DraftAttachment[] = [];

      for (const f of dropped) {
        try {
          const draft = f.path
            ? await readAttachmentPath(f.path)
            : await fileToDraft(f);
          if (draft) out.push(draft);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to read a file.');
        }
      }

      addDrafts(out);
    } finally {
      setLoadingCount(0);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current++;
    if (dragDepth.current === 1) setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const fileItems: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) fileItems.push(f);
      }
    }

    // Large plain-text paste (no files): auto-convert to a snippet chip
    if (fileItems.length === 0) {
      const pasted = e.clipboardData.getData('text/plain');
      const isLarge = pasted.split('\n').length >= 30 || pasted.length >= 1_500;
      if (isLarge) {
        e.preventDefault();
        addDrafts([createSnippetDraft(pasted)]);
      }
      return;
    }

    e.preventDefault();
    setError(null);
    setLoadingCount(fileItems.length);
    try {
      const out: DraftAttachment[] = [];
      for (const f of fileItems) {
        try {
          const draft = await fileToDraft(f);
          out.push(draft);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to read a pasted file.');
        }
      }
      addDrafts(out);
    } finally {
      setLoadingCount(0);
    }
  };

  return {
    attachments,
    loadingCount,
    dragging,
    error,
    supportsVision,
    hasUnsendableImages,
    visionNotice: hasUnsendableImages
      ? `${currentModelDef?.name ?? 'This model'} doesn't support images — image attachments won't be sent.${visionSuggestion()}`
      : null,
    setError,
    setAttachments,
    clearAttachments,
    removeAttachment,
    updateAttachment,
    handlePickFiles,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onPaste,
  };
}
