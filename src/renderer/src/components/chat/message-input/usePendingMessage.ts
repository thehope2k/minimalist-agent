import { useEffect, useRef } from 'react';

/**
 * Handles pre-composed text injection (e.g. from phase action buttons).
 * Prevents double-application and focuses the textarea after filling.
 */
export function usePendingMessage(
  pendingMessage: string | undefined,
  onPendingMessageConsumed: (() => void) | undefined,
  setValue: (text: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const prevPendingRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (pendingMessage && pendingMessage !== prevPendingRef.current) {
      prevPendingRef.current = pendingMessage;
      setValue(pendingMessage);
      onPendingMessageConsumed?.();
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else if (!pendingMessage) {
      prevPendingRef.current = undefined;
    }
  }, [pendingMessage, onPendingMessageConsumed, setValue, textareaRef]);
}
