import { BrowserWindow, ipcMain } from 'electron';
import { runAgentChat } from '../agent-runtime/runner';
import { parseError } from '../agent-runtime/errors';
import { resolveAuthForSlug } from '../auth/resolve';
import {
  type ConnectionMeta,
  deleteConnection,
  getCredential,
  getDefaultSlug,
  listConnections,
  renameConnection,
  reorderConnections,
  saveConnection,
  setDefaultSlug,
} from '../storage/connections';
import { onConnectionModelsChanged, refreshConnectionModels } from '../storage/model-refresh';
import { type Credential, isEncryptionAvailable } from '../storage/credentials';
import { type AiSettings, getSettings, saveSettings } from '../storage/settings';
import { invalidateContextFileCache } from '../agent-runtime/system-prompt';
import { createLogger } from '../logger';
import { fetchCodeMieBudget, fetchCodeMieIntegrations, fetchCodeMieModels, fetchCodeMieProjects, signInWithCodeMie } from '../codemie/sso';

const log = createLogger('connections-ipc');

/** Connection CRUD, connection testing/model discovery, and global AI settings. */
export function registerConnectionsIpc(): void {
  // Broadcast model-cache changes (background/manual refresh) to every window
  // so open settings/pickers update without a manual reload.
  onConnectionModelsChanged(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('connections:changed');
    }
  });

  ipcMain.handle('connections:list', () => listConnections());
  ipcMain.handle('connections:getDefaultSlug', () => getDefaultSlug());
  ipcMain.handle('connections:setDefaultSlug', (_e, slug: string | null) =>
    setDefaultSlug(slug ?? undefined),
  );
  ipcMain.handle(
    'connections:save',
    (_e, payload: { meta: ConnectionMeta; credential: Credential }) => {
      saveConnection(payload.meta, payload.credential);
    },
  );
  ipcMain.handle('connections:rename', (_e, args: { slug: string; name: string }) => {
    renameConnection(args.slug, args.name);
  });
  ipcMain.handle('connections:reorder', (_e, slugs: string[]) => {
    reorderConnections(slugs);
  });
  ipcMain.handle('connections:delete', (_e, slug: string) => {
    deleteConnection(slug);
  });
  ipcMain.handle('connections:getCredential', (_e, slug: string) => {
    const credential = getCredential(slug);
    return credential?.type === 'codemie_sso' ? null : credential;
  });
  ipcMain.handle('connections:isEncryptionAvailable', () =>
    isEncryptionAvailable(),
  );

  ipcMain.handle(
    'connections:test',
    async (_e, slug: string): Promise<{ ok: true } | { ok: false; error: ReturnType<typeof parseError> }> => {
      try {
        const auth = await resolveAuthForSlug(slug);
        // Tiniest possible round-trip - runAgentChat with maxTurns=1 and a
        // throwaway prompt. Pi/Copilot pathways don't run the SDK; for now
        // a successful auth resolve is sufficient validation there.
        const meta = listConnections().find((c) => c.slug === slug);
        if (!meta) throw new Error(`Connection "${slug}" not found.`);
        // OpenAI-compatible providers: do a real round-trip from main (no CORS)
        // by listing models. Validates the base URL + Bearer key cheaply.
        if ((meta.providerType === 'openai-compatible' || meta.providerType === 'codemie-sso') && auth.type === 'local_api') {
          const base = auth.baseUrl.replace(/\/+$/, '');
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 15_000);
          try {
            const res = await fetch(`${base}/models`, {
              headers: auth.apiKey ? { Authorization: `Bearer ${auth.apiKey}` } : {},
              signal: ctrl.signal,
            });
            if (res.ok) return { ok: true };
            if (res.status === 401 || res.status === 403) {
              return { ok: false, error: parseError(new Error('Invalid or unauthorized API key.')) };
            }
            // Some providers don't expose /models or gate it differently. A
            // non-auth failure isn't proof the key is bad — accept and let the
            // first real turn surface any error inline.
            return { ok: true };
          } catch (e) {
            // Network/abort: don't block saving on a flaky probe.
            return { ok: false, error: parseError(e) };
          } finally {
            clearTimeout(timeout);
          }
        }
        if (auth.type !== 'anthropic_api_key' && auth.type !== 'anthropic_oauth') {
          // Auth resolved → token is valid; don't burn an API call we can't make.
          return { ok: true };
        }
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 15_000);
        try {
          for await (const evt of runAgentChat({
            auth,
            turnId: `test-${slug}-${Date.now()}`,
            model: meta.defaultModel,
            prompt: 'ping',
            maxTurns: 1,
            permissionMode: 'auto',
            signal: ctrl.signal,
          })) {
            if (evt.type === 'turn_done') return { ok: true };
            if (evt.type === 'error') return { ok: false, error: evt.error };
          }
          return { ok: true };
        } finally {
          clearTimeout(timeout);
        }
      } catch (e) {
        return { ok: false, error: parseError(e) };
      }
    },
  );

  // Force-refresh a connection's model catalog (manual "Refresh models").
  // Background/TTL revalidation runs without this handler.
  ipcMain.handle('connections:refreshModels', (_e, slug: string) =>
    refreshConnectionModels(slug),
  );

  // List models a remote OpenAI-compatible provider advertises via /v1/models.
  // Used by the add-connection flow to merge live ids onto preset metadata.
  ipcMain.handle('codemie:fetchBudget', async (_e, args: { connectionSlug: string }) => {
    const connection = listConnections().find((item) => item.slug === args.connectionSlug);
    if (!connection || connection.providerType !== 'codemie-sso' || !connection.baseUrl || !connection.codeMieProject) {
      return { error: 'Connection is not a CodeMie SSO connection.' };
    }
    const credential = getCredential(connection.slug);
    if (!credential || credential.type !== 'codemie_sso') {
      return { error: 'No CodeMie SSO session is stored for this connection.' };
    }
    try {
      const budget = await fetchCodeMieBudget(connection.baseUrl, credential.cookies, connection.codeMieProject);
      return budget ?? { error: 'CodeMie reported no budget for the selected project.' };
    } catch (error) {
      log.warn('CodeMie budget lookup failed:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('codemie-sso:signIn', async (_e, args: { baseUrl: string }) => {
    const session = await signInWithCodeMie(args.baseUrl);
    const [ids, projects] = await Promise.all([
      fetchCodeMieModels(args.baseUrl, session.cookies),
      fetchCodeMieProjects(args.baseUrl, session.cookies),
    ]);
    const integrations = await Promise.all(
      projects.map(async (project) => {
        try {
          return [project, await fetchCodeMieIntegrations(args.baseUrl, session.cookies, project)] as const;
        } catch (error) {
          log.warn(`CodeMie integration discovery failed for project "${project}":`, error);
          return [project, []] as const;
        }
      }),
    );
    return { ...session, ids, projects, integrations: Object.fromEntries(integrations) };
  });

  ipcMain.handle(
    'connections:listRemoteModels',
    async (_e, args: { baseUrl: string; apiKey?: string }) => {
      const { fetchOpenAICompatibleModelIds } = await import('../openai-compatible/models');
      return fetchOpenAICompatibleModelIds(args.baseUrl, args.apiKey);
    },
  );

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_e, settings: AiSettings) => {
    saveSettings(settings);
    // Context file names changed - clear the discovery cache so the new list
    // takes effect on the next turn without requiring an app restart.
    invalidateContextFileCache();
  });
}
