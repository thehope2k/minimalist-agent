import { useEffect, useRef, useCallback, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { TabBar } from './terminal-panel/TabBar';
import { TerminalInstance, type TerminalInstanceHandle } from './terminal-panel/TerminalInstance';
import { useTerminalManager } from './terminal-panel/useTerminalManager';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/utils';

interface TerminalPanelProps {
  isOpen:     boolean;
  initialCwd: string | undefined;
  onClose:    () => void;
}

export function TerminalPanel({ isOpen, initialCwd, onClose }: TerminalPanelProps) {
  const manager       = useTerminalManager();
  const managerRef    = useRef(manager);
  managerRef.current  = manager;
  const isOpenRef     = useRef(isOpen);
  isOpenRef.current   = isOpen;
  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;

  // Per-tab refs for imperative access (clear, search).
  const tabRefs = useRef<Map<string, React.RefObject<TerminalInstanceHandle | null>>>(new Map());
  const getTabRef = (tabId: string) => {
    if (!tabRefs.current.has(tabId)) {
      tabRefs.current.set(tabId, { current: null } as React.RefObject<TerminalInstanceHandle | null>);
    }
    return tabRefs.current.get(tabId)!;
  };
  // Clean up refs for removed tabs.
  useEffect(() => {
    const liveIds = new Set(manager.tabs.map((t) => t.tabId));
    for (const id of tabRefs.current.keys()) {
      if (!liveIds.has(id)) tabRefs.current.delete(id);
    }
  }, [manager.tabs]);

  // Search bar state.
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeHandle = () =>
    manager.activeTabId ? tabRefs.current.get(manager.activeTabId)?.current : null;

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const findNext = useCallback((q = searchQuery) => {
    if (q) activeHandle()?.findNext(q, { caseSensitive: false });
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const findPrevious = useCallback((q = searchQuery) => {
    if (q) activeHandle()?.findPrevious(q, { caseSensitive: false });
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed first tab on panel open.
  useEffect(() => {
    if (!isOpen) return;
    if (managerRef.current.tabs.length === 0) {
      void managerRef.current.createTab(
        initialCwdRef.current ?? window.env?.homedir ?? '/'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-close when last tab is closed.
  useEffect(() => {
    if (!isOpenRef.current) return;
    if (manager.tabs.length === 0) onClose();
  }, [manager.tabs.length, onClose]);

  // Terminal-scoped keyboard shortcuts.
  useEffect(() => {
    const isTextInput = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement;
      // xterm.js focuses an internal textarea for key capture — don't treat it
      // as a user text field or all terminal shortcuts silently stop working.
      if (t.tagName === 'TEXTAREA' && t.closest('.xterm')) return false;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };

    const handler = (e: KeyboardEvent) => {
      if (!isOpenRef.current) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+Shift+T — new tab
      if (e.key === 'T' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        void managerRef.current.createTab(initialCwdRef.current ?? window.env?.homedir ?? '/');
        return;
      }

      // Cmd+Shift+W — close active tab
      if (e.key === 'W' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { activeTabId } = managerRef.current;
        if (activeTabId) void managerRef.current.closeTab(activeTabId);
        return;
      }

      // Cmd+F — open search bar.
      // stopPropagation() ensures bubble-phase handlers (e.g. chat find) do not
      // also fire when the terminal panel is open and this handler intercepts.
      if (e.key === 'f' && !e.shiftKey && !e.altKey) {
        // Only intercept when terminal panel is in focus context (not chat input etc.)
        if (!isTextInput(e)) {
          e.preventDefault();
          e.stopPropagation();
          openSearch();
          return;
        }
      }

      // Arrow tab switching — skip if focus is in a text field.
      if (isTextInput(e)) return;

      if (e.key === 'ArrowLeft' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation(); // prevent xterm from also processing the key
        const { tabs, activeTabId, setActiveTab } = managerRef.current;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.tabId === activeTabId);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].tabId);
        return;
      }

      if (e.key === 'ArrowRight' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation(); // prevent xterm from also processing the key
        const { tabs, activeTabId, setActiveTab } = managerRef.current;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.tabId === activeTabId);
        setActiveTab(tabs[(idx + 1) % tabs.length].tabId);
        return;
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [openSearch]);

  const newTab = useCallback(() => {
    void managerRef.current.createTab(initialCwdRef.current ?? window.env?.homedir ?? '/');
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TabBar
        tabs={manager.tabs}
        activeTabId={manager.activeTabId}
        onSelect={manager.setActiveTab}
        onClose={manager.closeTab}
        onNew={newTab}
        onClosePanel={onClose}
        onRename={manager.renameTab}
      />

      <div className="relative min-h-0 flex-1 bg-[#0c0c0c] p-1">
        {/* Search bar — floats top-right of the terminal area */}
        {searchOpen && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-panel px-2 py-1.5 shadow-xl">
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value) activeHandle()?.findNext(e.target.value, { caseSensitive: false });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.shiftKey ? findPrevious() : findNext(); }
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder="Find in terminal…"
              className={cn(
                'w-48 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle',
              )}
            />
            <IconButton icon={ChevronUp}   label="Previous match (Shift+Enter)" onClick={() => findPrevious()} />
            <IconButton icon={ChevronDown} label="Next match (Enter)"           onClick={() => findNext()} />
            <IconButton icon={X}           label="Close search (Esc)"           onClick={closeSearch} />
          </div>
        )}

        {manager.tabs.map((tab) => (
          <TerminalInstance
            key={tab.tabId}
            ref={getTabRef(tab.tabId)}
            tabId={tab.tabId}
            isActive={tab.tabId === manager.activeTabId && isOpen}
            alive={tab.alive}
          />
        ))}
      </div>
    </div>
  );
}
