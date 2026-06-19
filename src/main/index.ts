import { app, BrowserWindow, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { registerIpc } from './ipc';
import { cleanupPower } from './power';
import { initLogging, createLogger } from './logger';
import { Paths } from './storage/paths';
import { terminalManager } from './terminal/manager';
import { installSkillsReferenceDoc } from './skills/install-reference';
import { installExtensionsReferenceDoc } from './extensions/install-reference';
import { installAgentsReferenceDoc } from './agents/install-reference';
import { getAppIcon } from './app-icon';
import { checkOnLaunch } from './auto-update';
import { classifyExternalUrl, formatBlockedUrlError } from '../shared/url-safety';

import { isWorktreeSupported } from './agent/backends/pi/worktree-manager';

const __dirname = dirname(fileURLToPath(import.meta.url));

const log = createLogger('app');
const urlLog = createLogger('url-safety');

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


/**
 * True for URLs that load the app shell itself — the Vite dev server in dev,
 * or the bundled `renderer/index.html` (and assets it references) in prod.
 * Anything else is treated as an external URL and routed through the
 * classifier, so a stray top-frame navigation can't replace our React app
 * with attacker-controlled content.
 */
function isAppShellUrl(rawUrl: string): boolean {
  try {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && rawUrl.startsWith(devUrl)) return true;

    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'file:') return false;

    const filePath = fileURLToPath(parsed);
    const rendererRoot = join(__dirname, '..', 'renderer') + sep;
    return filePath.startsWith(rendererRoot);
  } catch {
    return false;
  }
}

/**
 * Single chokepoint for any renderer-initiated external URL. Classifies
 * via the shared blocklist before handing off to shell.openExternal so
 * dangerous schemes never reach the OS protocol dispatcher — closes the
 * middle-click / cmd-click / top-frame-navigation escape routes around
 * the `shell:openExternal` IPC handler in ipc.ts.
 */
function openExternalFromRenderer(url: string, context: string): void {
  const c = classifyExternalUrl(url);
  if (c.kind === 'dangerous') {
    urlLog.warn(`blocked ${context}:`, formatBlockedUrlError(c), url);
    return;
  }
  void shell.openExternal(url).catch((err) => {
    urlLog.warn(`openExternal failed (${context}):`, err);
  });
}

/**
 * Build the Content-Security-Policy delivered with every renderer response.
 *
 * Production is strict: `script-src 'self'` is the second half of the
 * XSS→IPC-RCE defense (the markdown sanitizer is the first) — even if some
 * markup slips past the sanitizer, the browser refuses to run injected,
 * inline, or remote scripts, and `connect-src`/`frame-src`/`object-src` cut
 * off the usual exfiltration and embedding vectors.
 *
 * Development relaxes `script-src`/`style-src` (Vite HMR injects inline code
 * and uses `eval`) and opens `connect-src` to the dev server + its HMR
 * websocket. Dev only ever loads our own `ELECTRON_RENDERER_URL`.
 *
 * `connect-src` keeps `localhost`/`127.0.0.1` in production because the
 * "Local Model" connection flow probes a local Ollama server directly from
 * the renderer (see LocalModelFlow.tsx); everything else reaches the network
 * through the main process over IPC.
 */
function buildCsp(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const isDev = !!devUrl;

  const localHosts = 'http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*';

  if (isDev) {
    const devOrigin = (() => {
      try {
        return new URL(devUrl).origin;
      } catch {
        return '';
      }
    })();
    const ws = 'ws://localhost:* ws://127.0.0.1:*';
    return [
      `default-src 'self' ${devOrigin}`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devOrigin}`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: https:`,
      `font-src 'self' data:`,
      `connect-src 'self' ${devOrigin} ${ws} ${localHosts}`,
      `frame-src 'none'`,
      `object-src 'none'`,
      `base-uri 'none'`,
      `form-action 'none'`,
    ].join('; ');
  }

  return [
    `default-src 'self'`,
    `script-src 'self'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${localHosts}`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
}

/**
 * Attach the CSP to every response. Combined with the markdown sanitizer this
 * collapses the renderer-XSS → `window.api` RCE chain: untrusted model/web/
 * file content can no longer load or execute scripts in the app origin.
 */
function installCsp(): void {
  const csp = buildCsp();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
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
    openExternalFromRenderer(url, 'window-open');
    return { action: 'deny' };
  });

  // Top-frame navigation (left-clicked <a href> without target=_blank,
  // window.location assignments, etc.). Without this, the BrowserWindow
  // would happily replace the React app shell with whatever the link
  // points to. Allow only the actual app shell; everything else is
  // treated as external and goes through the same classifier.
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppShellUrl(url)) return;
    event.preventDefault();
    openExternalFromRenderer(url, 'will-navigate');
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
  initLogging(Paths.logsDir());
  installSkillsReferenceDoc();
  installExtensionsReferenceDoc();
  installAgentsReferenceDoc();
  
  // Check git/worktree support for parallel agent isolation
  const worktreeSupported = await isWorktreeSupported();
  if (worktreeSupported) {
    log.info('Git worktree support available - parallel agents will use isolated workspaces');
  } else {
    log.warn('Git not found - parallel agents will share workspace (install git for better isolation)');
  }
  
  registerIpc();
  // Background stale-while-revalidate of model catalogs. Non-blocking so it
  // never delays window creation; updates broadcast to the renderer when done.
  void import('./storage/model-refresh').then((m) =>
    m.revalidateStaleConnections(),
  );
  installCsp();
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
  // Best-effort SIGTERM/KILL to any running Pi subprocesses so they don't
  // outlive the parent.
  void import('./agent/backends/pi/agent').then((m) => m.shutdownAllPiSubprocesses());
  // Kill any active agent sub-subprocesses.
  void import('./agent/backends/pi/agent-tool').then((m) => m.shutdownAllAgentSubprocesses());
});
