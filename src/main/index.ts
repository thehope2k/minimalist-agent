import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpc } from './ipc';
import { cleanupPower } from './power';
import { terminalManager } from './terminal/manager';
import { installSkillsReferenceDoc } from './skills/install-reference';
import { installExtensionsReferenceDoc } from './extensions/install-reference';
import { installAgentsReferenceDoc } from './agents/install-reference';
import { getAppIcon } from './app-icon';
import { checkOnLaunch } from './auto-update';
import { unwatchAll } from './sdd/watcher';
import { clearAll as sddClearAll } from './sdd/session-state';

const __dirname = dirname(fileURLToPath(import.meta.url));

app.setName('Minimalist Agent');

// ── PATH fix for macOS bundled app ───────────────────────────────────────────
// When launched from the Dock or Finder, macOS strips PATH down to
// /usr/bin:/bin:/usr/sbin:/sbin. Augment with the locations where user-installed
// CLIs live (Homebrew, uv/pipx, nvm, etc.) so tools like `specify` and `gh`
// are found the same way they are in a terminal session.
if (process.platform === 'darwin') {
  const home = process.env.HOME ?? '';
  const extras = [
    `${home}/.local/bin`,       // uv / pipx tool installs (specify lives here)
    '/opt/homebrew/bin',         // Apple Silicon Homebrew
    '/opt/homebrew/sbin',
    '/usr/local/bin',            // Intel Homebrew / manually installed tools
    '/usr/local/sbin',
    `${home}/.nvm/versions/node/current/bin`, // nvm default symlink (rare)
  ];
  const current = new Set((process.env.PATH ?? '').split(':'));
  const toAdd = extras.filter((p) => p && !current.has(p));
  if (toAdd.length > 0) {
    process.env.PATH = [...toAdd, process.env.PATH].filter(Boolean).join(':');
  }
}


function createWindow(icon?: Electron.NativeImage | null) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Minimalist Agent',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block Cmd+R / Ctrl+R (and the hard-reload Cmd+Shift+R) in production.
  // In dev the Vite HMR server is running and reloads are harmless; in a
  // packaged app a reload wipes all React state, aborts live agent turns,
  // and can corrupt in-flight session writes.
  if (!process.env.ELECTRON_RENDERER_URL) {
    win.webContents.on('before-input-event', (event, input) => {
      const mod = input.meta || input.control;
      if (mod && input.key.toLowerCase() === 'r' && !input.alt) {
        event.preventDefault();
      }
    });
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  installSkillsReferenceDoc();
  installExtensionsReferenceDoc();
  installAgentsReferenceDoc();
  registerIpc();
  const icon = await getAppIcon();
  if (process.platform === 'darwin' && app.dock && icon) {
    app.dock.setIcon(icon);
  }
  createWindow(icon);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(icon);
  });
  checkOnLaunch();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Drain pending in-renderer chat checkpoints to disk before letting the
// process exit. Without this, a kill-mid-stream loses the most recent
// ~500ms of accumulated tokens (the debounce window) plus the final
// `turn_done` write if main quits faster than the renderer can flush.
let drainedBeforeQuit = false;
app.on('before-quit', async (e) => {
  if (drainedBeforeQuit) return;
  e.preventDefault();
  drainedBeforeQuit = true;
  // Hard cap so a misbehaving renderer can't block app shutdown forever.
  const FLUSH_TIMEOUT_MS = 1500;
  const wins = BrowserWindow.getAllWindows();
  await Promise.race([
    Promise.all(
      wins.map((w) =>
        w.isDestroyed()
          ? Promise.resolve()
          : w.webContents
              .executeJavaScript(
                'window.__flushPendingChat ? window.__flushPendingChat() : null',
                true,
              )
              .catch(() => null),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
  ]);
  app.quit();
});

app.on('will-quit', () => {
  cleanupPower();
  terminalManager.killAll();
  // Stop all SDD file-system watchers and clear in-memory session state.
  unwatchAll();
  sddClearAll();
  // Best-effort SIGTERM/KILL to any running Pi subprocesses so they don't
  // outlive the parent.
  void import('./agent/backends/pi/agent').then((m) => m.shutdownAllPiSubprocesses());
  // Kill any active agent sub-subprocesses.
  void import('./agent/backends/pi/agent-tool').then((m) => m.shutdownAllAgentSubprocesses());
});
