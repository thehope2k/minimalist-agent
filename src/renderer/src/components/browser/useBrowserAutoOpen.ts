import { useEffect, useRef } from 'react';

/**
 * Opens the browser panel when a page appears in the chat on screen — once
 * per chat. If the user closes the panel while it shows that chat's page,
 * the chat stays dismissed; the header pill still reopens it.
 */
export function useBrowserAutoOpen(
  activeSessionId: string | null,
  browserPanelOpen: boolean,
  openBrowserPanel: () => void,
) {
  const opened = useRef(new Set<string>());
  const wasOpen = useRef(new Map<string, boolean>());
  const activeRef = useRef(activeSessionId);
  activeRef.current = activeSessionId;
  const openRef = useRef(openBrowserPanel);
  openRef.current = openBrowserPanel;

  useEffect(() => {
    return window.api.browser.onStateChanged((state) => {
      const before = wasOpen.current.get(state.sessionId) ?? false;
      wasOpen.current.set(state.sessionId, state.open);
      if (!state.open || before) return;
      if (state.sessionId !== activeRef.current) return;
      if (opened.current.has(state.sessionId)) return;
      opened.current.add(state.sessionId);
      openRef.current();
    });
  }, []);

  // Showing the panel for a chat (by any route) counts as its one auto-open,
  // so closing it afterwards sticks.
  useEffect(() => {
    if (browserPanelOpen && activeSessionId) opened.current.add(activeSessionId);
  }, [browserPanelOpen, activeSessionId]);
}
