import { useState, useRef, useCallback, useEffect } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

/**
 * Manages state for collapsible panels (sidebar, terminal, file explorer).
 * Provides refs and toggle functions.
 */
export function usePanelStates() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);

  const listPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const fileExplorerPanelRef = useRef<ImperativePanelHandle>(null);

  const terminalOpenRef = useRef(false);
  terminalOpenRef.current = terminalOpen;

  const toggleSidebar = useCallback(() => {
    const p = listPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, []);

  const toggleTerminal = useCallback(() => {
    const p = terminalPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) {
      p.expand();
      setTerminalOpen(true);
    } else {
      p.collapse();
      setTerminalOpen(false);
    }
  }, []);

  const toggleFileExplorer = useCallback(() => {
    const p = fileExplorerPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) {
      p.expand();
      setFileExplorerOpen(true);
    } else {
      p.collapse();
      setFileExplorerOpen(false);
    }
  }, []);

  // Ensure terminal and file explorer start collapsed on mount
  useEffect(() => {
    terminalPanelRef.current?.collapse();
    fileExplorerPanelRef.current?.collapse();
  }, []);

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    terminalOpen,
    setTerminalOpen,
    terminalOpenRef,
    fileExplorerOpen,
    setFileExplorerOpen,
    listPanelRef,
    terminalPanelRef,
    fileExplorerPanelRef,
    toggleSidebar,
    toggleTerminal,
    toggleFileExplorer,
  };
}
