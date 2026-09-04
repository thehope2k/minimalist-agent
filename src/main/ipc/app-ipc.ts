import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import { checkForUpdates, downloadUpdate, getUpdateInfo, installUpdateAndRestart } from '../auto-update';
import { classifyExternalUrl, formatBlockedUrlError } from '../../shared/url-safety';
import { recordRendererLog, revealLogFile, readRecentLogs } from '../logger';
import type { RendererLogRecord } from '../../shared/log';
import { getKeepAwake, setAgentActive, setKeepAwake } from '../power';
import { getAppIcon } from '../app-icon';

/** App lifecycle, native notifications, logs, and auto-update IPC. */
export function registerAppIpc(): void {
  // ---- App ---------------------------------------------------------------

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    // Renderer-driven URLs flow here from markdown link clicks, terminal
    // WebLinksAddon, etc. — all of which carry agent-generated text. Block
    // dangerous schemes before they reach shell.openExternal so a malicious
    // `file:` / `javascript:` link can't launch a local executable (Windows
    // Electron RCE class) or escape sandbox via the URL protocol handler.
    const classification = classifyExternalUrl(url);
    if (classification.kind === 'dangerous') {
      throw new Error(formatBlockedUrlError(classification));
    }
    return shell.openExternal(url);
  });
  ipcMain.handle('app:getKeepAwake', () => getKeepAwake());
  ipcMain.handle('app:setKeepAwake', (_e, enabled: boolean) => {
    setKeepAwake(enabled);
    return getKeepAwake();
  });
  ipcMain.handle('app:setAgentActive', (_e, active: boolean) => {
    setAgentActive(active);
  });

  // ---- Logs --------------------------------------------------------------

  // Renderer forwards its warn/error lines here so they land in the same
  // on-disk log file as the main process (bug-report continuity).
  ipcMain.on('log:write', (_e, record: RendererLogRecord) => {
    recordRendererLog(record);
  });
  ipcMain.handle('logs:reveal', () => revealLogFile());
  ipcMain.handle('logs:read', () => readRecentLogs());
  // Fire a native OS notification. Renderer gates this on its own
  // `notificationsEnabled` preference + window-focus check.
  ipcMain.handle(
    'app:notify',
    async (_e, payload: { title: string; body?: string }) => {
      if (!Notification.isSupported()) return false;
      const icon = await getAppIcon();
      const n = new Notification({
        title: payload.title,
        body: payload.body ?? '',
        silent: false,
        ...(icon ? { icon } : {}),
      });
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        n.on('click', () => {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        });
      }
      n.show();
      return true;
    },
  );

  // ---- Updates -----------------------------------------------------------

  ipcMain.handle('update:getInfo', () => getUpdateInfo());
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:download', () => downloadUpdate());
  ipcMain.handle('update:install', () => {
    installUpdateAndRestart();
  });
}
