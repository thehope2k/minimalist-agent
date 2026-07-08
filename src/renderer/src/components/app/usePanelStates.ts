import { useState, useRef, useCallback, useEffect } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import type { PanelImperativeHandle } from 'react-resizable-panels';

export type ActiveSidePanel = 'explorer' | 'context' | null;

/**
 * Manages state for collapsible panels (sidebar, terminal, side panel).
 *
 * The right side panel is a single slot — 'explorer' and 'context' are
 * mutually exclusive content rendered inside it. This avoids having two
 * panel refs fighting over the same layout region.
 */
export function usePanelStates() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  // Single side panel state: null = closed, 'explorer' | 'context' = open
  const [activeSidePanel, setActiveSidePanel] = useState<ActiveSidePanel>(null);

  const listPanelRef = usePanelRef();
  const terminalPanelRef = usePanelRef();
  const sidePanelRef = usePanelRef();

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
    const p: PanelImperativeHandle | null = sidePanelRef.current;
    if (!p) return;
    if (activeSidePanel === 'explorer') {
      // Already showing explorer — close the panel
      p.collapse();
      setActiveSidePanel(null);
    } else if (activeSidePanel === 'context') {
      // Context is open — switch content to explorer (panel stays open)
      setActiveSidePanel('explorer');
    } else {
      // Nothing open — expand
      p.expand();
      setActiveSidePanel('explorer');
    }
  }, [sidePanelRef, activeSidePanel]);

  const toggleContextPanel = useCallback(() => {
    const p: PanelImperativeHandle | null = sidePanelRef.current;
    if (!p) return;
    if (activeSidePanel === 'context') {
      // Already showing context — close the panel
      p.collapse();
      setActiveSidePanel(null);
    } else if (activeSidePanel === 'explorer') {
      // Explorer is open — switch content to context (panel stays open)
      setActiveSidePanel('context');
    } else {
      // Nothing open — expand
      p.expand();
      setActiveSidePanel('context');
    }
  }, [sidePanelRef, activeSidePanel]);

  // Ensure terminal and side panel start collapsed on mount
  useEffect(() => {
    terminalPanelRef.current?.collapse();
    sidePanelRef.current?.collapse();
  }, [terminalPanelRef, sidePanelRef]);

  // Derived booleans for consumers that check open state
  const fileExplorerOpen = activeSidePanel === 'explorer';
  const contextPanelOpen = activeSidePanel === 'context';

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    terminalOpen,
    setTerminalOpen,
    terminalOpenRef,
    activeSidePanel,
    setActiveSidePanel,
    fileExplorerOpen,
    contextPanelOpen,
    listPanelRef,
    terminalPanelRef,
    sidePanelRef,
    // Keep these names for backward compat with keyboard shortcuts panel doc
    fileExplorerPanelRef: sidePanelRef,
    toggleSidebar,
    toggleTerminal,
    toggleFileExplorer,
    toggleContextPanel,
  };
}
