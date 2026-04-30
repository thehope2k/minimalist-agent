/**
 * Auto-update via electron-updater + GitHub Releases.
 *
 * Flow (manual download, not auto-download):
 *   launch -> checkForUpdates() -> 'available' (no download started)
 *   user clicks Download -> downloadUpdate() -> 'downloading' -> 'ready'
 *   user clicks Restart Now -> quitAndInstall()
 *   user clicks Later -> autoInstallOnAppQuit picks it up on next quit
 *
 * macOS note: this only works correctly on a code-signed + notarized build.
 * Unsigned macOS builds will appear to download and "restart", but Gatekeeper
 * blocks the swapped bundle. Windows/Linux work unsigned.
 */
import { app, BrowserWindow } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdateInfo {
  state: UpdateState;
  currentVersion: string;
  latestVersion: string | null;
  progress: number;
  error?: string;
}

let info: UpdateInfo = {
  state: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  progress: 0,
};

function broadcast(): void {
  const snapshot = { ...info };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:info', snapshot);
  }
}

function setState(patch: Partial<UpdateInfo>): void {
  info = { ...info, ...patch };
  broadcast();
}

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;

  // Manual flow — never start the download without an explicit user action.
  autoUpdater.autoDownload = false;
  // If the user picks "Later", install when the app quits anyway.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setState({ state: 'checking', error: undefined });
  });

  autoUpdater.on('update-available', (u) => {
    setState({ state: 'available', latestVersion: u.version, progress: 0 });
  });

  autoUpdater.on('update-not-available', (u) => {
    setState({ state: 'idle', latestVersion: u.version });
  });

  autoUpdater.on('download-progress', (p) => {
    setState({ progress: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (u) => {
    setState({ state: 'ready', latestVersion: u.version, progress: 100 });
  });

  autoUpdater.on('error', (err) => {
    setState({ state: 'error', error: err?.message ?? String(err) });
  });
}

export function getUpdateInfo(): UpdateInfo {
  return { ...info };
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  if (!app.isPackaged) {
    // electron-updater refuses to work in dev anyway; surface a cleaner state.
    return getUpdateInfo();
  }
  configure();
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setState({
      state: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return getUpdateInfo();
}

export async function downloadUpdate(): Promise<UpdateInfo> {
  if (info.state !== 'available') return getUpdateInfo();
  setState({ state: 'downloading', progress: 0, error: undefined });
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    setState({
      state: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return getUpdateInfo();
}

export function installUpdateAndRestart(): void {
  if (info.state !== 'ready') return;
  // isSilent=false (show installer UI on Windows if needed),
  // isForceRunAfter=true (relaunch after install).
  autoUpdater.quitAndInstall(false, true);
}

/** Fire-and-forget check on launch. Safe to call before windows exist. */
export function checkOnLaunch(): void {
  if (!app.isPackaged) return;
  // Defer one tick so the first BrowserWindow exists before we broadcast.
  setTimeout(() => {
    void checkForUpdates();
  }, 1500);
}
