import { ipcMain } from 'electron';
import { terminalManager } from '../terminal/manager';
import { allowedShells } from '../terminal/harden';

/** Embedded terminal tabs (create/write/resize/kill), backed by node-pty. */
export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:resolveShell', () =>
    terminalManager.resolveShell(),
  );

  ipcMain.handle(
    'terminal:create',
    (_e, opts: { cwd: string; shell?: string }) =>
      terminalManager.create(opts.cwd, opts.shell),
  );

  ipcMain.handle(
    'terminal:write',
    (_e, args: { tabId: string; data: string }) =>
      terminalManager.write(args.tabId, args.data),
  );

  ipcMain.handle(
    'terminal:resize',
    (_e, args: { tabId: string; cols: number; rows: number }) =>
      terminalManager.resize(args.tabId, args.cols, args.rows),
  );

  ipcMain.handle('terminal:getScrollback', (_e, tabId: string) =>
    terminalManager.getScrollback(tabId),
  );

  ipcMain.handle('terminal:listTabs', () =>
    terminalManager.listTabs(),
  );

  ipcMain.handle('terminal:kill', (_e, tabId: string) =>
    terminalManager.kill(tabId),
  );

  ipcMain.handle('terminal:listShells', (): string[] => allowedShells());
}
