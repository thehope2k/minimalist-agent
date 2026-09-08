export interface TerminalTabState {
  tabId:        string;
  title:        string;        // auto-updated from PTY process name
  customTitle?: string;        // user's manual override; takes display priority
  alive:        boolean;
  exitCode?:    number;
  /** True when a background (non-active) tab has produced output since it was last viewed. */
  hasActivity?: boolean;
  /** Cwd the tab was launched with — used to resolve relative paths clicked in its output. */
  cwd:          string;
}
