import { useState, useRef, useCallback, useEffect } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import type { PanelImperativeHandle } from 'react-resizable-panels';

/**
 * Manages state for collapsible panels (sidebar, terminal, file explorer).
 * Provides refs and toggle functions.
 */
export function usePanelStates() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);

  const listPanelRef = usePanelRef();
  const terminalPanelRef = usePanelRef();
  const fileExplorerPanelRef = usePanelRef();

  const terminalOpenRef = useRef(terminalOpen);
  terminalOpenRef.current = terminalOpen;

  const toggleSidebar = useCallback(() => {
    const p: PanelImperativeHandle | null = listPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, [listPanelRef]);

  const toggleTerminal = useCallback(() => {
    const p: PanelImperativeHandle | null = terminalPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) {
      p.expand();
      setTerminalOpen(true);
    } else {
      p.collapse();
      setTerminalOpen(false);
    }
  }, [terminalPanelRef]);

  const toggleFileExplorer = useCallback(() => {
    const p: PanelImperativeHandle | null = fileExplorerPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) {
      p.expand();
      setFileExplorerOpen(true);
    } else {
      p.collapse();
      setFileExplorerOpen(false);
    }
  }, [fileExplorerPanelRef]);

  // Ensure terminal and file explorer start collapsed on mount
  useEffect(() => {
    terminalPanelRef.current?.collapse();
    fileExplorerPanelRef.current?.collapse();
  }, [terminalPanelRef, fileExplorerPanelRef]);

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
