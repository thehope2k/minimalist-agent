import { ipcRenderer } from 'electron';
import type {
  AgentError,
  AiSettings,
  AppApi,
  ConnectionMeta,
  Credential,
  ModelDef,
  TelemetrySettings,
  UserPreferences,
} from '../../shared/electron-api';

export function createConfigurationApi(): Pick<
  AppApi,
  'connections' | 'settings' | 'telemetry' | 'preferences'
> {
  return {
    connections: {
      list: (): Promise<ConnectionMeta[]> => ipcRenderer.invoke('connections:list'),
      getDefaultSlug: (): Promise<string | undefined> =>
        ipcRenderer.invoke('connections:getDefaultSlug'),
      setDefaultSlug: (slug: string | null): Promise<void> =>
        ipcRenderer.invoke('connections:setDefaultSlug', slug),
      save: (meta: ConnectionMeta, credential: Credential): Promise<void> =>
        ipcRenderer.invoke('connections:save', { meta, credential }),
      delete: (slug: string): Promise<void> => ipcRenderer.invoke('connections:delete', slug),
      rename: (slug: string, name: string): Promise<void> =>
        ipcRenderer.invoke('connections:rename', { slug, name }),
      reorder: (slugs: string[]): Promise<void> => ipcRenderer.invoke('connections:reorder', slugs),
      getCredential: (slug: string): Promise<Credential | null> =>
        ipcRenderer.invoke('connections:getCredential', slug),
      isEncryptionAvailable: (): Promise<boolean> =>
        ipcRenderer.invoke('connections:isEncryptionAvailable'),
      test: (slug: string): Promise<{ ok: true } | { ok: false; error: AgentError }> =>
        ipcRenderer.invoke('connections:test', slug),
      signInWithCodeMie: (args: {
        baseUrl: string;
      }): Promise<{
        cookies: Record<string, string>;
        expiresAt?: number;
        models: Array<{
          id: string;
          name: string;
          shortName: string;
          description: string;
          contextWindow: number;
          supportsVision?: boolean;
          supportsToolCalls?: boolean;
          supportsStreaming?: boolean;
        }>;
        projects: string[];
        integrations: Record<string, Array<{ id: string; alias: string }>>;
      }> => ipcRenderer.invoke('codemie-sso:signIn', args),
      fetchCodeMieBudget: (args: {
        connectionSlug: string;
      }): Promise<
        | { currentSpending: number; budgetLimit?: number; usedPercent: number; resetAt?: string }
        | { error: string }
      > => ipcRenderer.invoke('codemie:fetchBudget', args),
      listRemoteModels: (args: {
        baseUrl: string;
        apiKey?: string;
      }): Promise<{ ids: string[] } | { error: string }> =>
        ipcRenderer.invoke('connections:listRemoteModels', args),
      refreshModels: (
        slug: string,
      ): Promise<
        | { ok: true; changed: boolean; models: ModelDef[]; fetchedAt: number }
        | { ok: false; reason: 'unsupported' | 'error'; error?: string }
      > => ipcRenderer.invoke('connections:refreshModels', slug),
      /** Fires when a model cache is updated in the background or manually. */
      onChanged: (cb: () => void): (() => void) => {
        const handler = (): void => cb();
        ipcRenderer.on('connections:changed', handler);
        return () => ipcRenderer.removeListener('connections:changed', handler);
      },
    },
    settings: {
      get: (): Promise<AiSettings> => ipcRenderer.invoke('settings:get'),
      save: (settings: AiSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
      pushRecentFolder: (folder: string): Promise<AiSettings> =>
        ipcRenderer.invoke('settings:pushRecentFolder', folder),
      removeRecentFolder: (folder: string): Promise<AiSettings> =>
        ipcRenderer.invoke('settings:removeRecentFolder', folder),
    },
    telemetry: {
      get: (): Promise<TelemetrySettings> => ipcRenderer.invoke('telemetry:get'),
      save: (settings: TelemetrySettings): Promise<void> =>
        ipcRenderer.invoke('telemetry:save', settings),
      tracesPath: (): Promise<string> => ipcRenderer.invoke('telemetry:tracesPath'),
      reveal: (): Promise<void> => ipcRenderer.invoke('telemetry:reveal'),
    },
    preferences: {
      get: (): Promise<UserPreferences> => ipcRenderer.invoke('preferences:get'),
      save: (prefs: UserPreferences): Promise<void> =>
        ipcRenderer.invoke('preferences:save', prefs),
    },
  };
}
