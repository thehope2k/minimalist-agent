import { useCallback, useRef, useState } from 'react';

const FEEDBACK_DURATION_MS = 4000;

/**
 * Self-clearing inline status message (e.g. "File not found" next to a
 * clicked reference) — shared by MarkdownLink and PathField so both surfaces
 * flash feedback the same way instead of duplicating the timeout logic.
 */
export function useTransientFeedback(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((next: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(next);
    timeoutRef.current = setTimeout(() => setMessage(null), FEEDBACK_DURATION_MS);
  }, []);

  return [message, flash];
}
