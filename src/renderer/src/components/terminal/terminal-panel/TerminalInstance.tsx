import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Terminal as XTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import { IconButton } from '@/components/ui';
import { mountXterm } from './mountXterm';
import { usePasteGuard } from './usePasteGuard';
import { PasteConfirmDialog } from './PasteConfirmDialog';
import { TerminalContextMenu } from './ContextMenu';

export interface TerminalInstanceHandle {
  clear:        () => void;
  findNext:     (query: string, options?: { caseSensitive?: boolean; regex?: boolean }) => boolean;
  findPrevious: (query: string, options?: { caseSensitive?: boolean; regex?: boolean }) => boolean;
}

interface TerminalInstanceProps {
  tabId:      string;
  cwd:        string;
  isActive:   boolean;
  alive:      boolean;
  onOpenPath: (absolutePath: string, lineNumber: number) => void;
}

interface ContextMenuState {
  x:            number;
  y:            number;
  hasSelection: boolean;
}

export const TerminalInstance = forwardRef<TerminalInstanceHandle, TerminalInstanceProps>(
  function TerminalInstance({ tabId, cwd, isActive, alive, onOpenPath }, ref) {
    const containerRef  = useRef<HTMLDivElement>(null);
    const termRef       = useRef<XTerminal | null>(null);
    const fitRef        = useRef<FitAddon | null>(null);
    const searchRef     = useRef<SearchAddon | null>(null);
    const cleanupRef    = useRef<(() => void) | null>(null);
    const aliveRef      = useRef(alive);
    const cwdRef        = useRef(cwd);
    const onOpenPathRef = useRef(onOpenPath);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [pasteGuardInactive, setPasteGuardInactive] = useState(false);

    const { pendingPaste, pasteOrConfirm, confirmPaste, cancelPaste } = usePasteGuard(termRef);

    // Keep refs current without re-mounting the heavy xterm effect.
    useEffect(() => { aliveRef.current = alive; }, [alive]);
    useEffect(() => { cwdRef.current = cwd; }, [cwd]);
    useEffect(() => { onOpenPathRef.current = onOpenPath; }, [onOpenPath]);

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

      void mountXterm(containerRef.current, {
        tabId,
        getCwd:               () => cwdRef.current,
        isAlive:              () => aliveRef.current,
        onOpenPath:           (path, line) => onOpenPathRef.current(path, line),
        onPasteIntercepted:   (text) => pasteOrConfirm(text),
        onPasteGuardInactive: () => setPasteGuardInactive(true),
      }).then((mount) => {
        if (disposed) {
          mount.dispose();
          return;
        }
        termRef.current   = mount.term;
        fitRef.current    = mount.fitAddon;
        searchRef.current = mount.searchAddon;
        cleanupRef.current = () => {
          mount.dispose();
          termRef.current   = null;
          fitRef.current    = null;
          searchRef.current = null;
        };
      });

      return () => {
        disposed = true;
        cleanupRef.current?.();
        cleanupRef.current = null;
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
        pasteOrConfirm(await navigator.clipboard.readText());
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

        {/* Surfaces the (rare, xterm-upgrade-triggered) case where the
            multi-line paste safety net couldn't attach — pasting here now
            behaves like a plain terminal with no confirmation. */}
        {pasteGuardInactive && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Multi-line paste confirmation is unavailable for this tab — pasted text runs immediately.
            </span>
            <IconButton icon={X} label="Dismiss" onClick={() => setPasteGuardInactive(false)} />
          </div>
        )}

        {contextMenu && (
          <TerminalContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            hasSelection={contextMenu.hasSelection}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onClear={handleClear}
            onClose={closeMenu}
          />
        )}

        {pendingPaste !== null && (
          <PasteConfirmDialog text={pendingPaste} onConfirm={confirmPaste} onCancel={cancelPaste} />
        )}
      </div>
    );
  }
);
