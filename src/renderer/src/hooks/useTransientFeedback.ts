import { useCallback, useRef, useState } from 'react';

const FEEDBACK_DURATION_MS = 4000;

/**
 * Self-clearing inline status message (e.g. "File not found" next to a
 * clicked reference) — shared by MarkdownLink and PathField so both surfaces
 * flash feedback the same way instead of duplicating the timeout logic.
 *
 * Returns `[message, flash, dismiss]`. `flash` starts/restarts the auto-clear
 * timeout; `dismiss` clears immediately, for callers that also want to close
 * on outside click / Escape rather than waiting out the full timeout.
 */
export function useTransientFeedback(): [string | null, (message: string) => void, () => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(null);
  }, []);

  const flash = useCallback((next: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(next);
    timeoutRef.current = setTimeout(() => setMessage(null), FEEDBACK_DURATION_MS);
  }, []);

  return [message, flash, dismiss];
}
