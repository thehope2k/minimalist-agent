import type { Terminal as XTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import { getTerminalSettings } from '@/lib/terminal-settings';
import { createPathLinkProvider } from './path-link-provider';
import { attachNativePasteInterceptor } from './usePasteGuard';

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

export interface MountXtermOptions {
  tabId:              string;
  getCwd:             () => string;
  isAlive:            () => boolean;
  onOpenPath:         (absolutePath: string, lineNumber: number) => void;
  onPasteIntercepted: (text: string) => void;
  onPasteGuardInactive: () => void;
}

export interface XtermMount {
  term:        XTerminal;
  fitAddon:    FitAddon;
  searchAddon: SearchAddon;
  dispose:     () => void;
}

/**
 * Constructs one xterm.js instance wired to its pty tab: addons, theme,
 * scrollback replay, keystroke/output bridging, and the resize observer.
 * Kept out of the component so the "how do I build a terminal session" logic
 * is independently readable from the React mount/unmount plumbing around it.
 */
export async function mountXterm(
  container: HTMLElement,
  { tabId, getCwd, isAlive, onOpenPath, onPasteIntercepted, onPasteGuardInactive }: MountXtermOptions,
): Promise<XtermMount> {
  const [
    { Terminal },
    { FitAddon },
    { WebLinksAddon },
    { SearchAddon },
    { Unicode11Addon },
  ] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-web-links'),
    import('@xterm/addon-search'),
    import('@xterm/addon-unicode11'),
  ]);
  await import('@xterm/xterm/css/xterm.css');

  const settings = getTerminalSettings();
  const term = new Terminal({
    fontFamily:       settings.fontFamily,
    fontSize:         settings.fontSize,
    scrollback:       settings.scrollback,
    theme:            TERMINAL_THEME,
    cursorBlink:      true,
    allowProposedApi: true,
  });

  const fitAddon    = new FitAddon();
  const linksAddon  = new WebLinksAddon((_event, uri) => { void window.api.app.openExternal(uri); });
  const searchAddon = new SearchAddon();

  term.loadAddon(fitAddon);
  term.loadAddon(linksAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(new Unicode11Addon());
  term.open(container);
  // Correctly sizes wide/emoji characters — without this, unicode column
  // widths default to the (narrower) v6 table.
  term.unicode.activeVersion = '11';
  fitAddon.fit();
  term.focus();

  const pathLinkDisposable = term.registerLinkProvider(
    createPathLinkProvider(term, { getCwd, onOpenPath }),
  );

  // Copy-on-select: auto-copy to clipboard whenever the selection changes.
  const onSelDispose = term.onSelectionChange(() => {
    const sel = term.getSelection();
    if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
  });

  const scrollback = await window.api.terminal.getScrollback(tabId);
  if (scrollback) term.write(scrollback);

  const unsubData = window.api.terminal.onData((tid, data) => {
    if (tid === tabId) term.write(data);
  });

  const onDataDispose = term.onData((data) => {
    if (isAlive()) void window.api.terminal.write(tabId, data);
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

  const detachPaste = attachNativePasteInterceptor(container, onPasteIntercepted, onPasteGuardInactive);

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const ro = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      fitAddon.fit();
      void window.api.terminal.resize(tabId, term.cols, term.rows);
    }, 50);
  });
  ro.observe(container);

  return {
    term,
    fitAddon,
    searchAddon,
    dispose: () => {
      unsubData();
      onDataDispose.dispose();
      onSelDispose.dispose();
      pathLinkDisposable.dispose();
      detachPaste();
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      term.dispose();
    },
  };
}
