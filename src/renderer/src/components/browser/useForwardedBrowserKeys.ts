import { useEffect } from 'react';

/**
 * A focused page swallows keyboard input, so main forwards a few app
 * shortcuts (Cmd+Shift+O, Cmd+L, Cmd+K) pressed inside it. Replaying them as
 * keydown events reaches the existing handlers unchanged.
 */
export function useForwardedBrowserKeys() {
  useEffect(
    () =>
      window.api.browser.onForwardedKey((k) => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: k.key,
            code: k.code,
            shiftKey: k.shift,
            altKey: k.alt,
            metaKey: k.meta,
            ctrlKey: k.control,
            bubbles: true,
            cancelable: true,
          }),
        );
      }),
    [],
  );
}
