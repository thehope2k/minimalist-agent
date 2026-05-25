import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { TerminalTabInfo } from './types';

// 2 MB rolling scrollback per tab. Large enough for rich test output,
// small enough to stay inconsequential in memory even with many tabs.
const SCROLLBACK_MAX_BYTES = 2 * 1024 * 1024;

interface TabEntry {
  pty:    pty.IPty;
  title:  string;
  cwd:    string;
  shell:  string;
  buffer: string;
  alive:  boolean;
}

class TerminalManager {
  private tabs = new Map<string, TabEntry>();

  /** Return the user's preferred shell, with OS-appropriate fallbacks. */
  resolveShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC ?? 'powershell.exe';
    }
    return process.env.SHELL ?? '/bin/zsh';
  }

  create(cwd: string, shell?: string): TerminalTabInfo {
    const tabId         = randomUUID();
    const resolvedShell = shell ?? this.resolveShell();

    const ptyProcess = pty.spawn(resolvedShell, [], {
      name: 'xterm-256color',
      cwd,
      env:  { ...process.env } as Record<string, string>,
      cols: 80,
      rows: 24,
    });

    const entry: TabEntry = {
      pty:    ptyProcess,
      title:  basename(cwd) || cwd,
      cwd,
      shell:  resolvedShell,
      buffer: '',
      alive:  true,
    };
    this.tabs.set(tabId, entry);

    ptyProcess.onData((data) => {
      entry.buffer += data;
      // Trim the leading chars once we exceed the cap so memory stays bounded.
      // Advance past any low-surrogate at the cut point to avoid splitting a
      // surrogate pair and producing an invalid JS string.
      if (entry.buffer.length > SCROLLBACK_MAX_BYTES) {
        let cut = entry.buffer.length - SCROLLBACK_MAX_BYTES;
        const code = entry.buffer.charCodeAt(cut);
        if (code >= 0xdc00 && code <= 0xdfff) cut++;
        entry.buffer = entry.buffer.slice(cut);
      }
      // Reflect process-name changes (e.g. vim, npm) back to the renderer
      // by piggybacking on the data event. pty.process updates in real time.
      const currentProcess = ptyProcess.process;
      // When back at the shell prompt, show the folder name instead of the
      // shell binary (e.g. 'zsh') so multi-tab context stays meaningful.
      const shellBin = entry.shell.split('/').pop() ?? entry.shell;
      const nextTitle =
        currentProcess === shellBin ? (basename(entry.cwd) || entry.cwd) : currentProcess;
      if (nextTitle && nextTitle !== entry.title) {
        entry.title = nextTitle;
        this.broadcast('terminal:titleChange', { tabId, title: nextTitle });
      }
      this.broadcast('terminal:data', { tabId, data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      entry.alive = false;
      this.broadcast('terminal:exit', { tabId, exitCode });
    });

    return {
      tabId,
      title: entry.title,
      cwd,
      shell: resolvedShell,
      pid:   ptyProcess.pid,
      alive: true,
    };
  }

  write(tabId: string, data: string): void {
    this.tabs.get(tabId)?.pty.write(data);
  }

  resize(tabId: string, cols: number, rows: number): void {
    const entry = this.tabs.get(tabId);
    if (entry?.alive) entry.pty.resize(cols, rows);
  }

  /** Return the accumulated scrollback for a tab so the renderer can replay it. */
  getScrollback(tabId: string): string | null {
    return this.tabs.get(tabId)?.buffer ?? null;
  }

  listTabs(): TerminalTabInfo[] {
    return [...this.tabs.entries()].map(([tabId, e]) => ({
      tabId,
      title: e.title,
      cwd:   e.cwd,
      shell: e.shell,
      pid:   e.pty.pid,
      alive: e.alive,
    }));
  }

  kill(tabId: string): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;
    if (entry.alive) entry.pty.kill();
    this.tabs.delete(tabId);
  }

  /** Terminate all PTYs — called on app quit to avoid orphaned shell processes. */
  killAll(): void {
    for (const [tabId] of this.tabs) this.kill(tabId);
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }
}

// Singleton shared between ipc.ts and index.ts.
export const terminalManager = new TerminalManager();
