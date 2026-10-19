import { useSyncExternalStore } from 'react';
import type { BrowserPaneState } from '@/lib/electron';

// One subscription for every session row, instead of an IPC fetch + listener
// per row. Pages only exist within this app run, so pushes since startup
// cover every one.
const states = new Map<string, BrowserPaneState>();
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  unsubscribe ??= window.api.browser.onStateChanged((state) => {
    states.set(state.sessionId, state);
    for (const l of listeners) l();
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribe?.();
      unsubscribe = null;
    }
  };
}

/** What the agent is doing in this chat's browser right now, or null. */
export function useBrowserActivity(sessionId: string): string | null {
  return useSyncExternalStore(subscribe, () => states.get(sessionId)?.activity ?? null);
}
