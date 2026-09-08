import { useCallback, useState } from 'react';
import type { Terminal as XTerminal } from '@xterm/xterm';
import { createLogger } from '@/lib/logger';

const log = createLogger('terminal');

// Any paste with 2+ lines gets a confirmation instead of running straight
// through the shell — multi-line clipboard content (e.g. an LLM-generated
// snippet) would otherwise execute one command per line with no chance to review.
const PASTE_CONFIRM_MIN_LINES = 2;

/** Owns the "confirm before pasting multi-line content" state for one tab. */
export function usePasteGuard(termRef: React.RefObject<XTerminal | null>) {
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);

  const pasteOrConfirm = useCallback((text: string) => {
    if (!text) return;
    if (text.split('\n').length >= PASTE_CONFIRM_MIN_LINES) {
      setPendingPaste(text);
    } else {
      termRef.current?.paste(text);
    }
  }, [termRef]);

  const confirmPaste = useCallback(() => {
    setPendingPaste((text) => {
      if (text !== null) termRef.current?.paste(text);
      return null;
    });
  }, [termRef]);

  const cancelPaste = useCallback(() => setPendingPaste(null), []);

  return { pendingPaste, pasteOrConfirm, confirmPaste, cancelPaste };
}

/**
 * Intercepts the browser's native paste (Cmd+V) on xterm's hidden input so
 * multi-line content can be routed through the confirmation guard instead of
 * going straight to the pty via xterm's own paste handling.
 */
export function attachNativePasteInterceptor(
  container: HTMLElement,
  onPaste: (text: string) => void,
  onGuardInactive?: () => void,
): () => void {
  const helperTextarea = container.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
  if (!helperTextarea) {
    // If xterm's internal DOM ever changes shape, fail loudly rather than
    // silently falling back to xterm's own (unguarded) paste handling —
    // both to the log and to whoever is looking at this tab right now, since
    // the whole point of the guard is safety.
    log.warn('xterm-helper-textarea not found; multi-line paste guard is inactive for this tab');
    onGuardInactive?.();
    return () => {};
  }
  const handler = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    onPaste(e.clipboardData?.getData('text/plain') ?? '');
  };
  helperTextarea.addEventListener('paste', handler, true);
  return () => helperTextarea.removeEventListener('paste', handler, true);
}
