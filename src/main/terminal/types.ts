export interface TerminalTabInfo {
  tabId: string;
  title: string;
  cwd: string;
  shell: string;
  pid: number;
  alive: boolean;
}
