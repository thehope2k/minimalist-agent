import { useEffect, useRef, useCallback } from 'react';
import { TabBar } from './terminal-panel/TabBar';
import { TerminalInstance } from './terminal-panel/TerminalInstance';
import { useTerminalManager } from './terminal-panel/useTerminalManager';

interface TerminalPanelProps {
  /** Whether the resizable panel is expanded (not collapsed to 0). */
  isOpen:     boolean;
  /** Working directory to use for the very first tab only. */
  initialCwd: string | undefined;
  /** Called when the user clicks the × close-panel button. */
  onClose:    () => void;
}

/**
 * Persistent terminal panel with multiple tabs.
 *
 * This component stays mounted even when the panel is collapsed — that keeps
 * all TerminalInstance components alive so xterm state and IPC subscriptions
 * are preserved across Cmd+T toggles. The PTYs themselves live in the main
 * process and are never affected by renderer mount/unmount cycles.
 */
export function TerminalPanel({ isOpen, initialCwd, onClose }: TerminalPanelProps) {
  const manager       = useTerminalManager();
  // Stable refs so keyboard handlers don't go stale.
  const managerRef    = useRef(manager);
  managerRef.current  = manager;
  const isOpenRef     = useRef(isOpen);
  isOpenRef.current   = isOpen;
  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;

  // Seed a first tab whenever the panel opens and has no tabs.
  // Covers both: first-ever open, and reopen after the last tab was closed.
  // Intentionally only depends on `isOpen` — we don't want to re-fire on
  // every tab-count change, just on each open transition.
  useEffect(() => {
    if (!isOpen) return;
    if (managerRef.current.tabs.length === 0) {
      void managerRef.current.createTab(
        initialCwdRef.current ?? window.env?.homedir ?? '/'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const newTab = useCallback(() => {
    void managerRef.current.createTab(
      initialCwdRef.current ?? window.env?.homedir ?? '/',
    );
  }, []);

  // Terminal-scoped keyboard shortcuts (gated: panel open).
  useEffect(() => {
    const isTextInput = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement;
      return (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      if (!isOpenRef.current) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+Shift+T — new tab
      if (e.key === 'T' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        newTab();
        return;
      }

      // Cmd+Shift+W — close active tab
      if (e.key === 'W' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { activeTabId } = managerRef.current;
        if (activeTabId) void managerRef.current.closeTab(activeTabId);
        return;
      }

      // Arrow tab switching — skip if focus is in a text field (preserve cursor movement).
      if (isTextInput(e)) return;

      // Cmd+← — previous tab
      if (e.key === 'ArrowLeft' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { tabs, activeTabId, setActiveTab } = managerRef.current;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.tabId === activeTabId);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].tabId);
        return;
      }

      // Cmd+→ — next tab
      if (e.key === 'ArrowRight' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { tabs, activeTabId, setActiveTab } = managerRef.current;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.tabId === activeTabId);
        setActiveTab(tabs[(idx + 1) % tabs.length].tabId);
        return;
      }
    };

    // Capture phase: fires before xterm's own canvas listeners.
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [newTab]);

  // Auto-close the panel when the last tab is closed.
  // Only fire after the panel has actually been open (isOpenRef prevents closing on initial mount).
  useEffect(() => {
    if (!isOpenRef.current) return;
    if (manager.tabs.length === 0) onClose();
  }, [manager.tabs.length, onClose]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TabBar
        tabs={manager.tabs}
        activeTabId={manager.activeTabId}
        onSelect={manager.setActiveTab}
        onClose={manager.closeTab}
        onNew={newTab}
        onClosePanel={onClose}
      />

      {/* Terminal canvas area — all instances rendered, only active one visible. */}
      <div className="relative min-h-0 flex-1 bg-[#0c0c0c] p-1">
        {manager.tabs.map((tab) => (
            <TerminalInstance
              key={tab.tabId}
              tabId={tab.tabId}
              isActive={tab.tabId === manager.activeTabId && isOpen}
              alive={tab.alive}
            />
          ))
        }
      </div>
    </div>
  );
}
