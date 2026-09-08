export interface TerminalTabInfo {
  tabId:     string;
  title:     string;
  cwd:       string;
  shell:     string;
  pid:       number;
  alive:     boolean;
  /** Set once the process has exited; undefined while still running. */
  exitCode?: number;
}
