import { useEffect, useState } from 'react';
import { readAttachmentBase64 } from '@/lib/attachments';
import type { StoredAttachment } from '@/lib/electron';

/**
 * Loads thumbnail/resized image on mount, full resolution on lightbox open.
 */
export function useAttachmentImage(att: StoredAttachment, open: boolean) {
  // Prefer the persisted thumbnail/resized base64. If neither survived (older
  // sessions), fall back to reading bytes off disk on mount.
  const [src, setSrc] = useState<string | null>(() => {
    if (att.thumbnailBase64)
      return `data:image/png;base64,${att.thumbnailBase64}`;
    if (att.resizedBase64)
      return `data:${att.mimeType};base64,${att.resizedBase64}`;
    return null;
  });
  const [fullSrc, setFullSrc] = useState<string | null>(null);

  // Load thumbnail if not cached
  useEffect(() => {
    if (src) return;
    let alive = true;
    void readAttachmentBase64(att.storedPath).then((b64) => {
      if (alive && b64) setSrc(`data:${att.mimeType};base64,${b64}`);
    });
    return () => {
      alive = false;
    };
  }, [src, att.storedPath, att.mimeType]);

  // Load full resolution when lightbox opens
  useEffect(() => {
    if (!open || fullSrc) return;
    let alive = true;
    void readAttachmentBase64(att.storedPath).then((b64) => {
      if (alive && b64) setFullSrc(`data:${att.mimeType};base64,${b64}`);
    });
    return () => {
      alive = false;
    };
  }, [open, fullSrc, att.storedPath, att.mimeType]);

  return { src, fullSrc };
}
