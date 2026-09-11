import { ipcMain, shell } from 'electron';
import {
  cancelLogin as cancelCopilotLogin,
  type CopilotTokens,
  type DeviceCodeUpdate,
  startLogin as startCopilotLogin,
} from '../oauth/copilot-flow';
import {
  cancelLogin as cancelChatGptLogin,
  type ChatGptTokens,
  startLogin as startChatGptLogin,
} from '../oauth/chatgpt-flow';
import { resolveAuthForSlug } from '../auth/resolve';
import { getCredential, listConnections, type ModelDef } from '../storage/connections';
import { createLogger } from '../logger';

const log = createLogger('ipc:oauth');

/** OAuth login flows (Copilot, ChatGPT), usage/quota lookups, and
 *  live model discovery for provider-hosted connections. */
export function registerOAuthIpc(): void {
  // ---- GitHub Copilot OAuth (device flow via Pi SDK) ---------------------

  // The device flow is asynchronous: we start the flow, push a
  // `copilot-oauth:device-code` event when the user code is available, and
  // resolve the original `start` invocation only after the user has
  // authorized on github.com. The renderer awaits the start promise.
  ipcMain.handle('copilot-oauth:start', async (event): Promise<CopilotTokens> => {
    return startCopilotLogin((update: DeviceCodeUpdate) => {
      if (event.sender.isDestroyed()) return;
      event.sender.send('copilot-oauth:device-code', update);
      // Open the GitHub device-code page so the user doesn't have to copy URLs.
      void shell.openExternal(update.verificationUri);
    });
  });

  ipcMain.handle('copilot-oauth:cancel', () => cancelCopilotLogin());

  // ---- ChatGPT (Codex) OAuth (PKCE browser-redirect via Pi SDK) --------

  // The PKCE flow opens the user's browser to auth.openai.com and catches
  // the redirect on a local HTTP server (port 1455) the Pi SDK manages.
  // We push a `chatgpt-oauth:browser-open` event so the UI can render a
  // "waiting for browser" state, then resolve the start promise once the
  // Pi SDK completes the id_token → OpenAI API key exchange.
  ipcMain.handle('chatgpt-oauth:start', async (event): Promise<ChatGptTokens> => {
    return startChatGptLogin((url: string) => {
      if (event.sender.isDestroyed()) return;
      event.sender.send('chatgpt-oauth:browser-open', url);
      void shell.openExternal(url);
    });
  });

  ipcMain.handle('chatgpt-oauth:cancel', () => cancelChatGptLogin());

  /**
   * Live Copilot model discovery. Caller passes either a freshly-acquired
   * `refreshToken` (during the first-time setup flow, before a connection
   * is saved) OR a connection slug (to re-fetch later). Returns the
   * tier-filtered list or throws.
   */
  ipcMain.handle(
    'copilot:fetchModels',
    async (
      _e,
      args: { refreshToken?: string; connectionSlug?: string },
    ): Promise<{ models: ModelDef[] } | { error: string }> => {
      try {
        let token = args.refreshToken;
        if (!token && args.connectionSlug) {
          const cred = getCredential(args.connectionSlug);
          if (!cred || cred.type !== 'oauth' || !cred.refreshToken) {
            return { error: 'No GitHub refresh token stored for this connection.' };
          }
          token = cred.refreshToken;
        }
        if (!token) return { error: 'No token provided.' };
        const { fetchCopilotModels } = await import('../copilot/models');
        const models = await fetchCopilotModels(token);
        return { models };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  );
  /**
   * Fetch the current-month usage quota snapshot for a Copilot connection.
   * Uses the same copilot_internal/user endpoint that IntelliJ and VS Code use.
   *
   * As of June 1, 2026, returns AI Credits (token-based billing) for monthly
   * subscribers, or legacy premium request counts for annual plan subscribers.
   *
   * Works for all plan types including org-managed seats.
   */
  ipcMain.handle(
    'copilot:fetchQuota',
    async (
      _e,
      args: { connectionSlug: string },
    ) => {
      try {
        // copilot_internal/user uses the GitHub OAuth token (long-lived,
        // stored as refreshToken) - same credential as /copilot_internal/v2/token.
        const cred = getCredential(args.connectionSlug);
        if (!cred || cred.type !== 'oauth' || !cred.refreshToken) {
          return { error: 'No GitHub OAuth token stored for this connection.' };
        }
        const { fetchCopilotQuota } = await import('../copilot/quota');
        const result = await fetchCopilotQuota(cred.refreshToken);
        if ('error' in result) {
          log.error('fetchQuota:', result.error);
        }
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  /**
   * Fetch Codex rate-limit usage for a ChatGPT OAuth connection.
   * Uses the same wham/usage endpoint the Codex CLI polls, authenticated
   * with a freshly-resolved (auto-refreshed) ChatGPT access token.
   */
  ipcMain.handle(
    'chatgpt:fetchQuota',
    async (
      _e,
      args: { connectionSlug: string },
    ) => {
      try {
        const meta = listConnections().find((c) => c.slug === args.connectionSlug);
        if (!meta || meta.providerType !== 'openai-codex') {
          return { error: 'Connection is not a ChatGPT (Codex) OAuth connection.' };
        }
        const auth = await resolveAuthForSlug(args.connectionSlug);
        if (auth.type !== 'oauth') {
          return { error: 'Resolved auth is not ChatGPT OAuth.' };
        }
        const { fetchChatGptQuota } = await import('../chatgpt/quota');
        const result = await fetchChatGptQuota(auth.accessToken);
        if ('error' in result) {
          log.error('chatgpt:fetchQuota:', result.error);
        }
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  // ---- ChatGPT (Codex) model discovery ---------------------------

  ipcMain.handle('chatgpt:getModels', async (): Promise<ModelDef[]> => {
    const { getBuiltinModels } = await import('@earendil-works/pi-ai/providers/all');
    const raw = getBuiltinModels('openai-codex') as Array<{
      id: string; name: string; contextWindow: number; reasoning?: boolean;
    }>;
    return raw
      .sort((a, b) => b.id.localeCompare(a.id))
      .map((m): ModelDef => ({
        id: m.id,
        name: m.name,
        shortName: m.name,
        description: 'Codex',
        contextWindow: m.contextWindow ?? 272_000,
        supportsReasoning: m.reasoning,
      }));
  });
}
