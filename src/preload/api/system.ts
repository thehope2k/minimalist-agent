import { ipcRenderer } from 'electron';
import type {
  AppApi,
  ChatGptQuota,
  CopilotQuota,
  ModelDef,
  UpdateInfo,
} from '../../shared/electron-api';

export function createSystemApi(): Pick<
  AppApi,
  'update' | 'app' | 'logs' | 'copilotOAuth' | 'chatgptOAuth' | 'chatgpt' | 'copilot'
> {
  return {
    update: {
      getInfo: (): Promise<UpdateInfo> => ipcRenderer.invoke('update:getInfo'),
      check: (): Promise<UpdateInfo> => ipcRenderer.invoke('update:check'),
      download: (): Promise<UpdateInfo> => ipcRenderer.invoke('update:download'),
      install: (): Promise<void> => ipcRenderer.invoke('update:install'),
      onInfo: (cb: (info: UpdateInfo) => void): (() => void) => {
        const handler = (_e: unknown, payload: UpdateInfo) => cb(payload);
        ipcRenderer.on('update:info', handler);
        return () => ipcRenderer.removeListener('update:info', handler);
      },
    },
    app: {
      getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
      openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
      getKeepAwake: (): Promise<boolean> => ipcRenderer.invoke('app:getKeepAwake'),
      setKeepAwake: (enabled: boolean): Promise<boolean> =>
        ipcRenderer.invoke('app:setKeepAwake', enabled),
      setAgentActive: (active: boolean): Promise<void> =>
        ipcRenderer.invoke('app:setAgentActive', active),
      notify: (title: string, body?: string): Promise<boolean> =>
        ipcRenderer.invoke('app:notify', { title, body }),
    },
    logs: {
      write: (record: { level: string; scope: string; parts: string[] }): void =>
        ipcRenderer.send('log:write', record),
      reveal: (): Promise<void> => ipcRenderer.invoke('logs:reveal'),
      read: (): Promise<string> => ipcRenderer.invoke('logs:read'),
    },
    copilotOAuth: {
      start: (): Promise<{
        accessToken: string;
        refreshToken?: string;
        expiresAt?: number;
      }> => ipcRenderer.invoke('copilot-oauth:start'),
      cancel: (): Promise<void> => ipcRenderer.invoke('copilot-oauth:cancel'),
      onDeviceCode: (
        cb: (u: { userCode: string; verificationUri: string }) => void,
      ): (() => void) => {
        const handler = (_e: unknown, payload: { userCode: string; verificationUri: string }) =>
          cb(payload);
        ipcRenderer.on('copilot-oauth:device-code', handler);
        return () => ipcRenderer.removeListener('copilot-oauth:device-code', handler);
      },
    },
    chatgptOAuth: {
      start: (): Promise<{
        accessToken: string;
        refreshToken?: string;
        expiresAt?: number;
      }> => ipcRenderer.invoke('chatgpt-oauth:start'),
      cancel: (): Promise<void> => ipcRenderer.invoke('chatgpt-oauth:cancel'),
      onBrowserOpen: (cb: (url: string) => void): (() => void) => {
        const handler = (_e: unknown, url: string) => cb(url);
        ipcRenderer.on('chatgpt-oauth:browser-open', handler);
        return () => ipcRenderer.removeListener('chatgpt-oauth:browser-open', handler);
      },
    },
    chatgpt: {
      getModels: (): Promise<ModelDef[]> => ipcRenderer.invoke('chatgpt:getModels'),
      fetchQuota: (args: { connectionSlug: string }): Promise<ChatGptQuota | { error: string }> =>
        ipcRenderer.invoke('chatgpt:fetchQuota', args),
    },
    copilot: {
      fetchModels: (args: {
        refreshToken?: string;
        connectionSlug?: string;
      }): Promise<{ models: ModelDef[] } | { error: string }> =>
        ipcRenderer.invoke('copilot:fetchModels', args),
      fetchQuota: (args: { connectionSlug: string }): Promise<CopilotQuota | { error: string }> =>
        ipcRenderer.invoke('copilot:fetchQuota', args),
    },
  };
}
