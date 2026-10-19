import { useEffect, useState } from 'react';
import type { BrowserPaneState } from '@/lib/electron';

/** Live browser state for one chat: initial fetch plus main's pushes. */
export function useBrowserState(sessionId: string | null): BrowserPaneState | null {
  const [state, setState] = useState<BrowserPaneState | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState(null);
      return;
    }
    // A push can land before getState() resolves; once one has, the slower
    // initial fetch must not clobber it.
    let receivedPush = false;
    void window.api.browser.getState(sessionId).then((s) => {
      if (!receivedPush) setState(s);
    });
    return window.api.browser.onStateChanged((next) => {
      if (next.sessionId !== sessionId) return;
      receivedPush = true;
      setState(next);
    });
  }, [sessionId]);

  return state;
}
