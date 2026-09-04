import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { ipcMain, shell } from 'electron';
import { loadPreferences, savePreferences, type UserPreferences } from '../storage/preferences';
import { pushRecentFolder, removeRecentFolder } from '../storage/settings';
import {
  getTelemetrySettings,
  resolveTracesFile,
  saveTelemetrySettings,
  type TelemetrySettings,
} from '../storage/telemetry';

/** User preferences (recent folders, UI prefs) and OpenTelemetry tracing settings. */
export function registerPreferencesIpc(): void {
  // ---- Preferences ------------------------------------------------------
  ipcMain.handle('preferences:get', () => loadPreferences());
  ipcMain.handle('preferences:save', (_e, prefs: UserPreferences) =>
    savePreferences(prefs),
  );
  ipcMain.handle('settings:pushRecentFolder', (_e, folder: string) =>
    pushRecentFolder(folder),
  );
  ipcMain.handle('settings:removeRecentFolder', (_e, folder: string) =>
    removeRecentFolder(folder),
  );

  // ---- Telemetry (OpenTelemetry tracing) --------------------------------
  ipcMain.handle('telemetry:get', () => getTelemetrySettings());
  ipcMain.handle('telemetry:save', (_e, settings: TelemetrySettings) => {
    saveTelemetrySettings(settings);
    // Takes effect for subprocesses spawned after this point; the user is told
    // in the UI that a new chat picks up the change.
  });
  ipcMain.handle('telemetry:tracesPath', () => resolveTracesFile());
  ipcMain.handle('telemetry:reveal', () => {
    const p = resolveTracesFile();
    if (existsSync(p)) shell.showItemInFolder(p);
    else shell.showItemInFolder(dirname(p));
  });
}
