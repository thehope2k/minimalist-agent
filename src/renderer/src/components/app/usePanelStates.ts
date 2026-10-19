import { useState, useRef, useCallback, useEffect } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import type { PanelImperativeHandle } from 'react-resizable-panels';

export type SidePanelKind = 'explorer' | 'context' | 'browser' | 'file';
export type ActiveSidePanel = SidePanelKind | null;

// Opening width per kind; afterwards each kind remembers the user's width.
// The browser and file viewer need room for real content.
const DEFAULT_SIDE_WIDTH: Record<SidePanelKind, number> = {
  explorer: 30,
  context: 30,
  browser: 45,
  file: 60,
};
// Below this the stored width is a drag-to-collapse remnant, not a choice.
const MIN_REMEMBERED_WIDTH = 15;

/** Max width of the right side panel; the browser gets more room. */
export function sidePanelMaxSize(kind: ActiveSidePanel): string {
  return kind === 'browser' || kind === 'file' ? '70%' : '40%';
}

/**
 * Manages state for collapsible panels (sidebar, terminal, side panel).
 *
 * The right side panel is a single slot — 'explorer', 'context',
 * 'browser', and 'file' are mutually exclusive content rendered inside it. This avoids
 * having several panel refs fighting over the same layout region.
 */
export function usePanelStates() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState<ActiveSidePanel>(null);

  const listPanelRef = usePanelRef();
  const terminalPanelRef = usePanelRef();
  const sidePanelRef = usePanelRef();

  const terminalOpenRef = useRef(terminalOpen);
  terminalOpenRef.current = terminalOpen;

  // The panel a file was opened from, so the viewer's Back button can return to it.
  const [fileOrigin, setFileOrigin] = useState<SidePanelKind | null>(null);

  const sideWidths = useRef({ ...DEFAULT_SIDE_WIDTH });
  // Resizing must wait until the new kind's maxSize prop has rendered, or a
  // 45% browser width would be clamped to the previous kind's 40% cap.
  const pendingSideWidth = useRef<number | null>(null);

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

  const rememberWidth = useCallback(
    (kind: ActiveSidePanel) => {
      const p = sidePanelRef.current;
      if (!kind || !p || p.isCollapsed()) return;
      const width = p.getSize().asPercentage;
      if (width >= MIN_REMEMBERED_WIDTH) sideWidths.current[kind] = width;
    },
    [sidePanelRef],
  );

  /** Show `kind` in the side panel, or close the panel if it's already showing. */
  const toggleSidePanel = useCallback(
    (kind: SidePanelKind) => {
      const p: PanelImperativeHandle | null = sidePanelRef.current;
      if (!p) return;
      rememberWidth(activeSidePanel);
      if (activeSidePanel === kind && !p.isCollapsed()) {
        p.collapse();
        setActiveSidePanel(null);
        return;
      }
      pendingSideWidth.current = sideWidths.current[kind];
      setActiveSidePanel(kind);
    },
    [sidePanelRef, activeSidePanel, rememberWidth],
  );

  useEffect(() => {
    const width = pendingSideWidth.current;
    const p = sidePanelRef.current;
    if (width === null || !p) return;
    pendingSideWidth.current = null;
    p.expand();
    p.resize(`${width}%`);
  }, [activeSidePanel, sidePanelRef]);

  const toggleFileExplorer = useCallback(() => toggleSidePanel('explorer'), [toggleSidePanel]);
  const toggleContextPanel = useCallback(() => toggleSidePanel('context'), [toggleSidePanel]);
  const toggleBrowserPanel = useCallback(() => toggleSidePanel('browser'), [toggleSidePanel]);
  const toggleFilePanel = useCallback(() => toggleSidePanel('file'), [toggleSidePanel]);

  /** Opens the browser panel without toggling it closed if it's already showing. */
  const openBrowserPanel = useCallback(() => {
    const p = sidePanelRef.current;
    if (activeSidePanel === 'browser' && p && !p.isCollapsed()) return;
    toggleSidePanel('browser');
  }, [activeSidePanel, sidePanelRef, toggleSidePanel]);

  /** Shows the file viewer, remembering the panel it replaced; re-opening just swaps the file. */
  const openFilePanel = useCallback(() => {
    const p = sidePanelRef.current;
    if (activeSidePanel === 'file' && p && !p.isCollapsed()) return;
    setFileOrigin(activeSidePanel !== null && activeSidePanel !== 'file' ? activeSidePanel : null);
    toggleSidePanel('file');
  }, [activeSidePanel, sidePanelRef, toggleSidePanel]);

  /** Leaves the file viewer for the panel it was opened from, or closes the side panel. */
  const closeFilePanel = useCallback(() => {
    if (activeSidePanel !== 'file') return;
    if (fileOrigin) {
      rememberWidth('file');
      pendingSideWidth.current = sideWidths.current[fileOrigin];
      setActiveSidePanel(fileOrigin);
    } else {
      toggleSidePanel('file');
    }
    setFileOrigin(null);
  }, [activeSidePanel, fileOrigin, rememberWidth, toggleSidePanel]);

  // Ensure terminal and side panel start collapsed on mount
  useEffect(() => {
    terminalPanelRef.current?.collapse();
    sidePanelRef.current?.collapse();
  }, [terminalPanelRef, sidePanelRef]);

  // Derived booleans for consumers that check open state
  const fileExplorerOpen = activeSidePanel === 'explorer';
  const contextPanelOpen = activeSidePanel === 'context';
  const browserPanelOpen = activeSidePanel === 'browser';

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
    browserPanelOpen,
    listPanelRef,
    terminalPanelRef,
    sidePanelRef,
    // Keep these names for backward compat with keyboard shortcuts panel doc
    fileExplorerPanelRef: sidePanelRef,
    toggleSidebar,
    toggleTerminal,
    toggleFileExplorer,
    toggleContextPanel,
    toggleBrowserPanel,
    openBrowserPanel,
    toggleFilePanel,
    openFilePanel,
    closeFilePanel,
    fileOrigin,
  };
}
