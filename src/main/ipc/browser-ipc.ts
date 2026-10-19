import { BrowserWindow, ipcMain } from 'electron';
import { browserPaneManager } from '../browser/browser-pane-manager';
import type { Surface } from '../browser/browser-surface';

/** Docked browser pane: surface sync, chrome actions, and state push. */
export function registerBrowserIpc(): void {
  browserPaneManager.onStateChanged((state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('browser-state-changed', state);
    }
  });

  browserPaneManager.onForwardedKey((key) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('browser-forwarded-key', key);
    }
  });

  ipcMain.handle('browser:getState', (_e, sessionId: string) =>
    browserPaneManager.getState(sessionId),
  );

  // Fire-and-forget: sent up to once per animation frame while resizing.
  ipcMain.on('browser:setSurface', (e, surface: Surface) => {
    const host = BrowserWindow.fromWebContents(e.sender);
    if (host) browserPaneManager.setSurface(host, surface);
  });

  ipcMain.handle('browser:freezeImage', (_e, sessionId: string) =>
    browserPaneManager.freezeImage(sessionId),
  );

  ipcMain.handle('browser:open', (_e, sessionId: string) => browserPaneManager.userOpen(sessionId));

  ipcMain.handle('browser:navigate', (_e, sessionId: string, input: string) =>
    browserPaneManager.userNavigate(sessionId, input),
  );

  ipcMain.handle(
    'browser:history',
    (_e, sessionId: string, action: 'back' | 'forward' | 'reload' | 'stop') =>
      browserPaneManager.userHistory(sessionId, action),
  );

  ipcMain.handle('browser:release', (_e, sessionId: string) =>
    browserPaneManager.release(sessionId),
  );

  ipcMain.handle('browser:handToAgent', (_e, sessionId: string) =>
    browserPaneManager.handToAgent(sessionId),
  );

  ipcMain.handle('browser:popOut', (_e, sessionId: string) => browserPaneManager.popOut(sessionId));

  ipcMain.handle('browser:dock', (_e, sessionId: string) => browserPaneManager.dock(sessionId));

  ipcMain.handle('browser:openDevTools', (_e, sessionId: string) =>
    browserPaneManager.openDevTools(sessionId),
  );

  ipcMain.handle('browser:close', (_e, sessionId: string) => browserPaneManager.close(sessionId));
}
