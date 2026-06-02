import { useEffect, useState } from 'react';
import { updateSessionMeta } from '@/lib/sessions';

/**
 * Manages draft title editing with commit on blur/Enter.
 */
export function useTitleEditor(
  open: boolean,
  sessionId: string | null,
  title: string,
) {
  const [draftTitle, setDraftTitle] = useState(title);

  // Reset draft when popover opens or title changes upstream
  useEffect(() => {
    if (open) setDraftTitle(title);
  }, [open, title]);

  const commitTitle = async () => {
    const next = draftTitle.trim();
    if (!sessionId || !next || next === title) return;
    await updateSessionMeta(sessionId, { title: next });
  };

  const resetDraft = () => setDraftTitle(title);

  return {
    draftTitle,
    setDraftTitle,
    commitTitle,
    resetDraft,
  };
}
