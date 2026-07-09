import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { Terminal as XTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import { cn } from '@/lib/utils';
import { getTerminalSettings } from '@/lib/terminal-settings';

const TERMINAL_THEME = {
  background:          '#0c0c0c',
  foreground:          '#e8e8e8',
  cursor:              '#e8e8e8',
  cursorAccent:        '#0c0c0c',
  selectionBackground: 'rgba(255,255,255,0.2)',
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

export interface TerminalInstanceHandle {
  clear:        () => void;
  findNext:     (query: string, options?: { caseSensitive?: boolean; regex?: boolean }) => boolean;
  findPrevious: (query: string, options?: { caseSensitive?: boolean; regex?: boolean }) => boolean;
}

interface TerminalInstanceProps {
  tabId:    string;
  isActive: boolean;
  alive:    boolean;
}

interface ContextMenu {
  x:           number;
  y:           number;
  hasSelection: boolean;
}

export const TerminalInstance = forwardRef<TerminalInstanceHandle, TerminalInstanceProps>(
  function TerminalInstance({ tabId, isActive, alive }, ref) {
    const containerRef  = useRef<HTMLDivElement>(null);
    const termRef       = useRef<XTerminal | null>(null);
    const fitRef        = useRef<FitAddon | null>(null);
    const searchRef     = useRef<SearchAddon | null>(null);
    const cleanupRef    = useRef<(() => void) | null>(null);
    const aliveRef      = useRef(alive);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

    // Keep aliveRef current without re-mounting the heavy xterm effect.
    useEffect(() => { aliveRef.current = alive; }, [alive]);

    // Expose imperative handles to TerminalPanel.
    useImperativeHandle(ref, () => ({
      clear: () => termRef.current?.clear(),
      findNext: (query, opts) => searchRef.current?.findNext(query, opts) ?? false,
      findPrevious: (query, opts) => searchRef.current?.findPrevious(query, opts) ?? false,
    }), []);

    // Mount xterm once per tabId.
    useEffect(() => {
      if (!containerRef.current) return;
      let disposed = false;

      void (async () => {
        const [
          { Terminal },
          { FitAddon },
          { WebLinksAddon },
          { SearchAddon },
        ] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
          import('@xterm/addon-search'),
        ]);
        await import('@xterm/xterm/css/xterm.css');

        if (disposed || !containerRef.current) return;

        const settings = getTerminalSettings();
        const term = new Terminal({
          fontFamily:    settings.fontFamily,
          fontSize:      settings.fontSize,
          scrollback:    settings.scrollback,
          theme:         TERMINAL_THEME,
          cursorBlink:   true,
          allowProposedApi: true,
        });

        const fitAddon    = new FitAddon();
        const linksAddon  = new WebLinksAddon((_event, uri) => {
          void window.api.app.openExternal(uri);
        });
        const searchAddon = new SearchAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(linksAddon);
        term.loadAddon(searchAddon);
        term.open(containerRef.current);
        fitAddon.fit();
        term.focus();

        termRef.current   = term;
        fitRef.current    = fitAddon;
        searchRef.current = searchAddon;

        // Copy-on-select: auto-copy to clipboard whenever the selection changes.
        const onSelDispose = term.onSelectionChange(() => {
          const sel = term.getSelection();
          if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
        });

        // Replay buffered output.
        const scrollback = await window.api.terminal.getScrollback(tabId);
        if (scrollback && !disposed) term.write(scrollback);

        // PTY output → xterm.
        const unsubData = window.api.terminal.onData((tid, data) => {
          if (tid === tabId) term.write(data);
        });

        // Keystrokes → PTY. Use aliveRef so we always read the current value
        // without re-running this effect (which would tear down and re-mount xterm).
        const onDataDispose = term.onData((data) => {
          if (aliveRef.current) void window.api.terminal.write(tabId, data);
        });

        // Cmd+K — clear terminal (only fires when xterm canvas has focus).
        term.attachCustomKeyEventHandler((e) => {
          if (e.type !== 'keydown') return true;
          if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            term.clear();
            return false;
          }
          return true;
        });

        // Resize.
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

        cleanupRef.current = () => {
          disposed = true;
          unsubData();
          onDataDispose.dispose();
          onSelDispose.dispose();
          ro.disconnect();
          if (resizeTimer) clearTimeout(resizeTimer);
          term.dispose();
          termRef.current   = null;
          fitRef.current    = null;
          searchRef.current = null;
        };
      })();

      return () => {
        disposed = true;
        cleanupRef.current?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId]);

    // Refit when tab becomes visible.
    useEffect(() => {
      if (!isActive) return;
      const t = setTimeout(() => {
        if (!fitRef.current || !termRef.current) return;
        fitRef.current.fit();
        void window.api.terminal.resize(tabId, termRef.current.cols, termRef.current.rows);
        termRef.current.focus();
      }, 50);
      return () => clearTimeout(t);
    }, [isActive, tabId]);

    // Right-click context menu.
    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({
        x:            e.clientX,
        y:            e.clientY,
        hasSelection: !!termRef.current?.getSelection(),
      });
    };

    const closeMenu = () => setContextMenu(null);

    const handleCopy = () => {
      const sel = termRef.current?.getSelection();
      if (sel) void navigator.clipboard.writeText(sel);
      closeMenu();
    };

    const handlePaste = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) void window.api.terminal.write(tabId, text);
      } catch { /* clipboard permission denied */ }
      closeMenu();
    };

    const handleClear = () => {
      termRef.current?.clear();
      closeMenu();
    };

    return (
      <div
        style={{ display: isActive ? 'block' : 'none' }}
        className="relative h-full w-full"
        onContextMenu={handleContextMenu}
      >
        <div ref={containerRef} className="h-full w-full" />

        {/* Right-click context menu */}
        {contextMenu && (
          <>
            {/* Invisible backdrop to close on outside click */}
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <div
              className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-border bg-panel py-1 shadow-2xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.hasSelection && (
                <ContextMenuItem label="Copy" onClick={handleCopy} />
              )}
              <ContextMenuItem label="Paste" onClick={handlePaste} />
              <div className="my-1 h-px bg-border/50" />
              <ContextMenuItem label="Clear" onClick={handleClear} />
            </div>
          </>
        )}
      </div>
    );
  }
);

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center px-3 py-1.5 text-left text-sm text-fg',
        'hover:bg-elevated transition-colors',
      )}
    >
      {label}
    </button>
  );
}
