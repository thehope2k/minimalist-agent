import { useState, useEffect, useCallback } from 'react';
import type { TerminalTabState } from './types';

interface TerminalState {
  tabs:        TerminalTabState[];
  activeTabId: string | null;
}

export interface UseTerminalManagerResult {
  tabs:         TerminalTabState[];
  activeTabId:  string | null;
  setActiveTab: (tabId: string) => void;
  createTab:    (cwd: string) => Promise<void>;
  closeTab:     (tabId: string) => Promise<void>;
  renameTab:    (tabId: string, customTitle: string | undefined) => void;
}

export function useTerminalManager(): UseTerminalManagerResult {
  const [state, setState] = useState<TerminalState>({ tabs: [], activeTabId: null });

  // Re-hydrate on mount — reconcile renderer state with live PTYs in main process.
  // Handles the case where the terminal panel was closed and reopened, or the
  // settings view was shown (which keeps TerminalPanel mounted).
  useEffect(() => {
    window.api.terminal.listTabs().then((liveTabs) => {
      if (liveTabs.length === 0) return;
      setState({
        tabs: liveTabs.map((t) => ({ tabId: t.tabId, title: t.title, alive: t.alive })),
        activeTabId: liveTabs[liveTabs.length - 1].tabId,
      });
    });
  }, []);

  // Subscribe to push events from the main process for the lifetime of this hook.
  useEffect(() => {
    const unsubTitle = window.api.terminal.onTitleChange((tabId, title) => {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.tabId === tabId ? { ...t, title } : t)),
      }));
    });

    const unsubExit = window.api.terminal.onExit((tabId) => {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.tabId === tabId ? { ...t, alive: false } : t)),
      }));
    });

    return () => {
      unsubTitle();
      unsubExit();
    };
  }, []);

  const createTab = useCallback(async (cwd: string) => {
    const info = await window.api.terminal.create({ cwd });
    setState((prev) => ({
      tabs:        [...prev.tabs, { tabId: info.tabId, title: info.title, alive: info.alive }],
      activeTabId: info.tabId,
    }));
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    await window.api.terminal.kill(tabId);
    setState((prev) => {
      const idx  = prev.tabs.findIndex((t) => t.tabId === tabId);
      const next = prev.tabs.filter((t) => t.tabId !== tabId);
      let newActive = prev.activeTabId;
      if (newActive === tabId) {
        newActive = next.length > 0 ? next[Math.min(idx, next.length - 1)].tabId : null;
      }
      return { tabs: next, activeTabId: newActive };
    });
  }, []);

  const renameTab = useCallback((tabId: string, customTitle: string | undefined) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.tabId === tabId ? { ...t, customTitle: customTitle || undefined } : t,
      ),
    }));
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    setState((prev) => ({ ...prev, activeTabId: tabId }));
  }, []);

  return { tabs: state.tabs, activeTabId: state.activeTabId, setActiveTab, createTab, closeTab, renameTab };
}
