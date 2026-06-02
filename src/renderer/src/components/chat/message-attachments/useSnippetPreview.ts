import { useEffect, useState } from 'react';
import { readAttachmentBase64 } from '@/lib/attachments';

/**
 * Lazy-loads snippet text when preview is first opened.
 */
export function useSnippetPreview(open: boolean, storedPath: string) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!open || text !== null) return;
    let alive = true;
    void readAttachmentBase64(storedPath).then((b64) => {
      if (alive && b64) setText(atob(b64));
    });
    return () => {
      alive = false;
    };
  }, [open, text, storedPath]);

  return { text };
}
