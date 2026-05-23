import { useEffect, useRef } from 'react';
import type { Terminal as XTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { getTerminalSettings } from '@/lib/terminal-settings';

// Dark theme tuned to match the app's dark palette.
const TERMINAL_THEME = {
  background:          '#0c0c0c',
  foreground:          '#e8e8e8',
  cursor:              '#e8e8e8',
  cursorAccent:        '#0c0c0c',
  selectionBackground: 'rgba(255,255,255,0.15)',
  black:               '#1e1e1e',
  red:                 '#f14c4c',
  green:               '#23d18b',
  yellow:              '#f5f543',
  blue:                '#3b8eea',
  magenta:             '#d670d6',
  cyan:                '#29b8db',
  white:               '#e5e5e5',
  brightBlack:         '#666666',
  brightRed:           '#f14c4c',
  brightGreen:         '#23d18b',
  brightYellow:        '#f5f543',
  brightBlue:          '#3b8eea',
  brightMagenta:       '#d670d6',
  brightCyan:          '#29b8db',
  brightWhite:         '#ffffff',
};

interface TerminalInstanceProps {
  tabId:    string;
  isActive: boolean;
  alive:    boolean;
}

/**
 * Mounts a single xterm.js terminal instance for one PTY tab.
 *
 * Stays mounted even when not the active tab (display:none) — this preserves
 * terminal state without reattaching. When the active tab changes or the panel
 * reopens (isActive flips to true), the terminal refits to the visible dimensions.
 */
export function TerminalInstance({ tabId, isActive, alive }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<XTerminal | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);

  // Mount the xterm terminal once per tabId.
  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    void (async () => {
      // Dynamic imports — keeps xterm out of the initial bundle chunk.
      const [
        { Terminal },
        { FitAddon },
        { CanvasAddon },
        { WebLinksAddon },
      ] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-canvas'),
        import('@xterm/addon-web-links'),
      ]);

      // CSS must be imported for xterm to render correctly.
      await import('@xterm/xterm/css/xterm.css');

      if (disposed || !containerRef.current) return;

      const settings = getTerminalSettings();

      const term = new Terminal({
        fontFamily:  settings.fontFamily,
        fontSize:    settings.fontSize,
        scrollback:  settings.scrollback,
        theme:       TERMINAL_THEME,
        cursorBlink: true,
        allowProposedApi: true,
      });

      const fitAddon    = new FitAddon();
      const canvasAddon = new CanvasAddon();
      const linksAddon  = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(canvasAddon);
      term.loadAddon(linksAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitRef.current  = fitAddon;

      // Replay buffered output from the main-process ring buffer.
      const scrollback = await window.api.terminal.getScrollback(tabId);
      if (scrollback && !disposed) term.write(scrollback);

      // IPC → xterm: stream PTY output from main process.
      const unsubData = window.api.terminal.onData((tid, data) => {
        if (tid === tabId) term.write(data);
      });

      // xterm → IPC: forward keystrokes to the PTY.
      const onDataDispose = term.onData((data) => {
        if (alive) void window.api.terminal.write(tabId, data);
      });

      // Resize: debounced ResizeObserver keeps PTY dimensions in sync with DOM.
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (!containerRef.current || disposed) return;
          const { width, height } = containerRef.current.getBoundingClientRect();
          if (width === 0 || height === 0) return;
          fitAddon.fit();
          void window.api.terminal.resize(tabId, term.cols, term.rows);
        }, 50);
      });
      ro.observe(containerRef.current);

      // Cleanup on unmount.
      return () => {
        disposed = true;
        unsubData();
        onDataDispose.dispose();
        ro.disconnect();
        if (resizeTimer) clearTimeout(resizeTimer);
        term.dispose();
        termRef.current = null;
        fitRef.current  = null;
      };
    })().then((cleanup) => {
      if (cleanup) {
        // Store cleanup for the useEffect teardown below — patched via ref.
        cleanupRef.current = cleanup;
      }
    });

    return () => {
      disposed = true;
      cleanupRef.current?.();
    };
    // tabId is stable for the lifetime of this instance — intentional dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Holds the async cleanup returned from the dynamic-import block.
  const cleanupRef = useRef<(() => void) | null>(null);

  // Refit when this tab becomes the active/visible one.
  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => {
      if (!fitRef.current || !termRef.current) return;
      fitRef.current.fit();
      void window.api.terminal.resize(tabId, termRef.current.cols, termRef.current.rows);
    }, 50);
    return () => clearTimeout(t);
  }, [isActive, tabId]);

  return (
    <div
      ref={containerRef}
      style={{ display: isActive ? 'block' : 'none' }}
      className="h-full w-full"
    />
  );
}
