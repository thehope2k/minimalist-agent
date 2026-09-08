import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/lib/logger';
import { getTerminalSettings } from '@/lib/terminal-settings';
import type { TerminalTabState } from './types';

const log = createLogger('terminal');

interface TerminalState {
  tabs:        TerminalTabState[];
  activeTabId: string | null;
  error:       string | null;
}

export interface UseTerminalManagerResult {
  tabs:         TerminalTabState[];
  activeTabId:  string | null;
  error:        string | null;
  setActiveTab: (tabId: string) => void;
  createTab:    (cwd: string) => Promise<void>;
  closeTab:     (tabId: string) => Promise<void>;
  renameTab:    (tabId: string, customTitle: string | undefined) => void;
  dismissError: () => void;
}

export function useTerminalManager(): UseTerminalManagerResult {
  const [state, setState] = useState<TerminalState>({ tabs: [], activeTabId: null, error: null });

  // Re-hydrate on mount — reconcile renderer state with live PTYs in main process.
  // Handles the case where the terminal panel was closed and reopened, or the
  // settings view was shown (which keeps TerminalPanel mounted).
  useEffect(() => {
    window.api.terminal.listTabs().then((liveTabs) => {
      if (liveTabs.length === 0) return;
      setState((prev) => ({
        ...prev,
        tabs: liveTabs.map((t) => ({ tabId: t.tabId, title: t.title, alive: t.alive })),
        activeTabId: liveTabs[liveTabs.length - 1].tabId,
      }));
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
    const { shell } = getTerminalSettings();
    try {
      const info = await window.api.terminal.create({ cwd, shell: shell || undefined });
      setState((prev) => ({
        ...prev,
        tabs:        [...prev.tabs, { tabId: info.tabId, title: info.title, alive: info.alive }],
        activeTabId: info.tabId,
        error:       null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('failed to create terminal tab', err);
      setState((prev) => ({ ...prev, error: message }));
    }
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
      return { ...prev, tabs: next, activeTabId: newActive, error: null };
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
    setState((prev) => ({ ...prev, activeTabId: tabId, error: null }));
  }, []);

  const dismissError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    tabs:        state.tabs,
    activeTabId: state.activeTabId,
    error:       state.error,
    setActiveTab,
    createTab,
    closeTab,
    renameTab,
    dismissError,
  };
}
