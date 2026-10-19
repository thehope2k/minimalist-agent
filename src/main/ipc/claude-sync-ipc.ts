import { BrowserWindow, dialog, ipcMain } from 'electron';
import { previewSync, runSync } from '../claude-sync';
import { addSyncFolders, scanForProjects } from '../claude-sync/targets';

function asExcluded(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([group, keys]) => [
      group,
      Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [],
    ]),
  );
}

export function registerClaudeSyncIpc(): void {
  ipcMain.handle('claudeSync:preview', (_e, includeSecrets: unknown, excluded?: unknown) =>
    previewSync(includeSecrets === true, asExcluded(excluded)),
  );
  ipcMain.handle('claudeSync:run', (_e, includeSecrets: unknown, excluded?: unknown) =>
    runSync(includeSecrets === true, asExcluded(excluded) ?? {}),
  );
  ipcMain.handle('claudeSync:addFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const options = {
      title: 'Find projects to sync',
      message:
        'MA looks up to three folders deep for projects with MA skills, agents, or extensions.',
      properties: ['openDirectory' as const],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const added = scanForProjects(picked.filePaths[0]);
    addSyncFolders(added);
    return { added };
  });
}
