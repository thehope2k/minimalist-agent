import { ipcRenderer } from 'electron';
import type { AppApi, BrowserPaneState, TerminalTabInfo } from '../../shared/electron-api';

export function createToolsApi(): Pick<AppApi, 'git' | 'terminal' | 'voice' | 'browser'> {
  return {
    git: {
      status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
      diff: (args: {
        repoRoot: string;
        relativePath: string;
        absolutePath: string;
        status: string;
      }) => ipcRenderer.invoke('git:diff', args),
      commitFiles: (args: {
        repoRoot: string;
        files: Array<{
          relativePath: string;
          absolutePath: string;
          status: string;
          content?: string;
        }>;
        message: string;
        amend?: boolean;
      }) => ipcRenderer.invoke('git:commitFiles', args),
      lastCommitMessage: (repoRoot: string) =>
        ipcRenderer.invoke('git:lastCommitMessage', repoRoot),
      branchName: (repoRoot: string) => ipcRenderer.invoke('git:branchName', repoRoot),
      lastCommitFiles: (repoRoot: string) => ipcRenderer.invoke('git:lastCommitFiles', repoRoot),
      lastCommitFileDiff: (args: {
        repoRoot: string;
        relativePath: string;
        oldPath?: string;
        status: string;
      }) => ipcRenderer.invoke('git:lastCommitFileDiff', args),
      lastCommitDiff: (repoRoot: string) => ipcRenderer.invoke('git:lastCommitDiff', repoRoot),
      generateCommitMessage: (args: {
        connectionSlug: string;
        model?: string;
        diffContext: string;
        userContext?: string;
        sessionId?: string;
        cwd?: string;
      }) => ipcRenderer.invoke('git:generateCommitMessage', args),
      mergeState: (repoRoot: string) => ipcRenderer.invoke('git:mergeState', repoRoot),
      conflictContent: (args: { repoRoot: string; relativePath: string; absolutePath: string }) =>
        ipcRenderer.invoke('git:conflictContent', args),
      resolveConflict: (args: {
        repoRoot: string;
        relativePath: string;
        absolutePath: string;
        content: string;
      }) => ipcRenderer.invoke('git:resolveConflict', args),
      abortOperation: (args: { repoRoot: string; type: string }) =>
        ipcRenderer.invoke('git:abortOperation', args),
      continueMerge: (args: { repoRoot: string; message: string; type: string }) =>
        ipcRenderer.invoke('git:continueMerge', args),
    },
    terminal: {
      resolveShell: (): Promise<string> => ipcRenderer.invoke('terminal:resolveShell'),

      create: (opts: { cwd: string; shell?: string }): Promise<TerminalTabInfo> =>
        ipcRenderer.invoke('terminal:create', opts),

      write: (tabId: string, data: string): Promise<void> =>
        ipcRenderer.invoke('terminal:write', { tabId, data }),

      resize: (tabId: string, cols: number, rows: number): Promise<void> =>
        ipcRenderer.invoke('terminal:resize', { tabId, cols, rows }),

      getScrollback: (tabId: string): Promise<string | null> =>
        ipcRenderer.invoke('terminal:getScrollback', tabId),

      listTabs: (): Promise<TerminalTabInfo[]> => ipcRenderer.invoke('terminal:listTabs'),

      kill: (tabId: string): Promise<void> => ipcRenderer.invoke('terminal:kill', tabId),

      listShells: (): Promise<string[]> => ipcRenderer.invoke('terminal:listShells'),

      onData: (cb: (tabId: string, data: string) => void): (() => void) => {
        const h = (_e: unknown, p: { tabId: string; data: string }) => cb(p.tabId, p.data);
        ipcRenderer.on('terminal:data', h);
        return () => ipcRenderer.removeListener('terminal:data', h);
      },

      onExit: (cb: (tabId: string, exitCode: number) => void): (() => void) => {
        const h = (_e: unknown, p: { tabId: string; exitCode: number }) => cb(p.tabId, p.exitCode);
        ipcRenderer.on('terminal:exit', h);
        return () => ipcRenderer.removeListener('terminal:exit', h);
      },

      onTitleChange: (cb: (tabId: string, title: string) => void): (() => void) => {
        const h = (_e: unknown, p: { tabId: string; title: string }) => cb(p.tabId, p.title);
        ipcRenderer.on('terminal:titleChange', h);
        return () => ipcRenderer.removeListener('terminal:titleChange', h);
      },
    },
    voice: {
      getModelStatus: (): Promise<'ready' | 'not-downloaded'> =>
        ipcRenderer.invoke('voice:getModelStatus'),

      downloadModel: (): Promise<'ready' | 'not-downloaded'> =>
        ipcRenderer.invoke('voice:downloadModel'),

      startSession: (token: string): Promise<void> =>
        ipcRenderer.invoke('voice:startSession', token),

      pushChunk: (token: string, samples: Float32Array): Promise<string[]> =>
        ipcRenderer.invoke('voice:pushChunk', token, samples),

      endSession: (token: string): Promise<string[]> =>
        ipcRenderer.invoke('voice:endSession', token),

      onDownloadProgress: (
        cb: (progress: { downloadedBytes: number; totalBytes: number | null }) => void,
      ): (() => void) => {
        const h = (_e: unknown, p: { downloadedBytes: number; totalBytes: number | null }) => cb(p);
        ipcRenderer.on('voice:downloadProgress', h);
        return () => ipcRenderer.removeListener('voice:downloadProgress', h);
      },
    },
    browser: {
      getState: (sessionId: string): Promise<BrowserPaneState> =>
        ipcRenderer.invoke('browser:getState', sessionId),

      focus: (sessionId: string): Promise<void> => ipcRenderer.invoke('browser:focus', sessionId),

      release: (sessionId: string): Promise<BrowserPaneState> =>
        ipcRenderer.invoke('browser:release', sessionId),

      close: (sessionId: string): Promise<BrowserPaneState> =>
        ipcRenderer.invoke('browser:close', sessionId),

      onStateChanged: (cb: (state: BrowserPaneState) => void): (() => void) => {
        const h = (_e: unknown, state: BrowserPaneState) => cb(state);
        ipcRenderer.on('browser-state-changed', h);
        return () => ipcRenderer.removeListener('browser-state-changed', h);
      },
    },
  };
}
