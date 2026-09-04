import { BrowserWindow, ipcMain } from 'electron';
import { browserPaneManager } from '../browser/browser-pane-manager';

/** Agent-driven browser tool panes (state sync + focus/release/close). */
export function registerBrowserIpc(): void {
  browserPaneManager.onStateChanged((state) => {
    // Pane windows are BrowserWindows too now — don't assume index 0 in
    // getAllWindows() is the main chat window; skip past any pane windows.
    const win = BrowserWindow.getAllWindows().find((w) => !browserPaneManager.isPaneWindow(w));
    if (win && !win.isDestroyed()) win.webContents.send('browser-state-changed', state);
  });

  ipcMain.handle('browser:getState', (_e, sessionId: string) =>
    browserPaneManager.getState(sessionId),
  );

  ipcMain.handle('browser:focus', (_e, sessionId: string) =>
    browserPaneManager.focus(sessionId),
  );

  ipcMain.handle('browser:release', (_e, sessionId: string) =>
    browserPaneManager.release(sessionId),
  );

  ipcMain.handle('browser:close', (_e, sessionId: string) =>
    browserPaneManager.close(sessionId),
  );
}
