export interface TerminalTabState {
  tabId:        string;
  title:        string;        // auto-updated from PTY process name
  customTitle?: string;        // user's manual override; takes display priority
  alive:        boolean;
}
