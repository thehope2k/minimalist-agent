import {app, BrowserWindow, dialog, ipcMain, Notification, shell} from 'electron';
import {terminalManager} from './terminal/manager';
import {allowedShells} from './terminal/harden';
import {checkForUpdates, downloadUpdate, getUpdateInfo, installUpdateAndRestart,} from './auto-update';
import {type DraftAttachment, readPathAsDraft, readStoredAsBase64, storeDraft,} from './storage/attachments';
import type {StoredAttachment} from './storage/sessions';
import {
  appendMessage,
  branchSession,
  clearProjectFromSessions,
  createSession,
  deleteSession,
  listSessionFiles,
  listSessions,
  loadSession,
  replaceLastMessage,
  rewriteMessages,
  type SessionMeta,
  sessionPath,
  setSessionProject,
  type StoredMessage,
  truncateMessagesFrom,
  updateSessionMeta,
} from './storage/sessions';
import {clearLoginState, exchangeCode, prepareLoginUrl,} from './oauth/claude-flow';
import {classifyExternalUrl, formatBlockedUrlError} from '../shared/url-safety';
import {recordRendererLog, revealLogFile, readRecentLogs, createLogger} from './logger';
import type {RendererLogRecord} from '../shared/log';

const log = createLogger('ipc');
import {
  cancelLogin as cancelCopilotLogin,
  type CopilotTokens,
  type DeviceCodeUpdate,
  startLogin as startCopilotLogin,
} from './oauth/copilot-flow';
import {
  cancelLogin as cancelChatGptLogin,
  type ChatGptTokens,
  startLogin as startChatGptLogin,
} from './oauth/chatgpt-flow';
import {runAgentChat} from './agent/claude';
import {apply1MContextSuffix} from './agent/models';
import {steerAnthropicTurn} from './agent/backends/anthropic';
import {steerPiTurn, sendPlanApprovalResponse} from './agent/backends/pi/agent';
import {generateTitle} from './agent/title';
import {parseError} from './agent/errors';
import {resolveAuthForSlug} from './auth/resolve';
import {
  type AiSettings,
  getSettings,
  type PermissionMode,
  pushRecentFolder,
  removeRecentFolder,
  saveSettings,
} from './storage/settings';
import {
  getTelemetrySettings,
  saveTelemetrySettings,
  resolveTracesFile,
  type TelemetrySettings,
} from './storage/telemetry';
import type {EngagementRequest, EngagementResponse,} from '../shared/collaboration-types';
import {getActivePlan, updatePlanCache as updatePlan} from './agent/plan-cache';
import type {Phase} from '../shared/planning-types';
import {getKeepAwake, setAgentActive, setKeepAwake} from './power';
import {getAppIcon} from './app-icon';
import {
  type ConnectionMeta,
  deleteConnection,
  getCredential,
  getDefaultSlug,
  listConnections,
  type ModelDef,
  saveConnection,
  setDefaultSlug,
} from './storage/connections';
import {
  maybeRevalidate,
  onConnectionModelsChanged,
  refreshConnectionModels,
} from './storage/model-refresh';
import {loadPreferences, savePreferences, type UserPreferences,} from './storage/preferences';
import {type Credential, isEncryptionAvailable} from './storage/credentials';
import {Paths} from './storage/paths';
import {
  deleteSkill,
  getSkillsDir,
  invalidateSkillsCache,
  loadAllSkills,
  type LoadedSkill,
  loadSkillBySlug,
  scanSkillDirectory,
  type SkillFileNode,
} from './skills/storage';
import {formatValidationResult, validateSkillContent,} from './skills/parse';
import {
  type AgentFileNode,
  deleteAgent,
  getAgentsDir,
  invalidateAgentsCache,
  loadAgentBySlug,
  loadAllAgents,
  type LoadedAgent,
  scanAgentDirectory,
} from './agents/storage';
import {formatValidationResult as formatAgentValidationResult, validateAgentContent,} from './agents/parse';
import {
  deleteExtension,
  type ExtensionFileNode,
  getExtensionsDir,
  invalidateExtensionsCache,
  loadAllExtensions,
  loadExtensionBySlug,
  scanExtensionDirectory,
  setExtensionEnabled,
} from './extensions/storage';
import type {LoadedExtension} from './extensions/types';
import {
  formatValidationResult as formatExtensionValidationResult,
  validateExtensionConfigContent,
  validateExtensionGuideContent,
} from './extensions/parse';
import {getExtensionRegistry} from './extensions/registry';
import {
  deleteSecret as deleteExtensionSecret,
  isSecretsEncryptionAvailable,
  listSecretKeys as listExtensionSecretKeys,
  setSecret as setExtensionSecret,
} from './extensions/secrets';
import {
  grantConsent,
  hasConsent,
  listDeclaredSecrets,
  listMcpExtensionsStatus,
  listMissingSecrets,
  revokeConsent,
} from './extensions/mcp-config';
import {type FileSearchEntry, searchFiles} from './files/search';
import {buildFileTree, listDirectory} from './files/list-directory';
import {isWithinAllowedRoots, resolveWithinAllowedRoots} from './files/path-guard';
import {readFileSync, existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {publishExport, revokeExport, type PublishResult} from './export-transport/brewpage';
import {invalidateContextFileCache} from './agent/system-prompt';
import {
  createProject,
  deleteProject,
  listProjects,
  type Project,
  type ProjectInput,
  updateProject,
} from './storage/projects';

export interface ChatSendRequest {
  /** Caller-provided id used to correlate streamed events to a UI message. */
  id: string;
  /**
   * Connection slug - main resolves it into a fresh `AnthropicAuth`
   * server-side (refreshing OAuth tokens if needed). The renderer never
   * touches the access token directly. See `src/main/auth/resolve.ts`.
   */
  connectionSlug: string;
  model: string;
  prompt: string;
  /** Working directory for the SDK subprocess. */
  cwd?: string;
  /** Resume the SDK session for multi-turn continuity. */
  resumeSessionId?: string;
  /** Bound for tool-use loops in this turn. */
  maxTurns?: number;
  /** Permission mode for this turn ('plan' | 'auto'). */
  permissionMode?: PermissionMode;
  /**
   * Owning session id - required so per-session "Allow for session"
   * approvals can be remembered across turns. Optional only because the
   * very first send happens before the renderer has called sessions:create;
   * useChat.ts always provides it once the session exists.
   */
  sessionId?: string;
  /** Already-stored attachments for this turn. */
  attachments?: StoredAttachment[];
}

const inFlight = new Map<string, AbortController>();

/**
 * Per-turn routing info so `chat:steer` knows which backend to call.
 * Cleared in the same `finally` that clears inFlight.
 */
interface TurnInfo {
  providerType: 'anthropic' | 'pi';
  /** For Pi turns - used to find the right subprocess. */
  chatSessionId?: string;
}
const turnInfo = new Map<string, TurnInfo>();

/**
 * Pending permission prompts - one entry per outstanding renderer round
 * trip. Keyed by reqId; cleared on response, abort, or window close.
 */
/**
 * Pending collaboration prompts (RequestDecision, RequestPreference, etc.).
 * Handles intelligent engagement system where LLM decides when to collaborate.
 */
const pendingCollaborations = new Map<
  string,
  { resolve: (r: EngagementResponse) => void; turnId: string }
>();

export function registerIpc(): void {
  // ---- App ---------------------------------------------------------------

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    // Renderer-driven URLs flow here from markdown link clicks, terminal
    // WebLinksAddon, etc. — all of which carry agent-generated text. Block
    // dangerous schemes before they reach shell.openExternal so a malicious
    // `file:` / `javascript:` link can't launch a local executable (Windows
    // Electron RCE class) or escape sandbox via the URL protocol handler.
    const classification = classifyExternalUrl(url);
    if (classification.kind === 'dangerous') {
      throw new Error(formatBlockedUrlError(classification));
    }
    return shell.openExternal(url);
  });
  ipcMain.handle('app:getKeepAwake', () => getKeepAwake());
  ipcMain.handle('app:setKeepAwake', (_e, enabled: boolean) => {
    setKeepAwake(enabled);
    return getKeepAwake();
  });
  ipcMain.handle('app:setAgentActive', (_e, active: boolean) => {
    setAgentActive(active);
  });

  // ---- Logs --------------------------------------------------------------

  // Renderer forwards its warn/error lines here so they land in the same
  // on-disk log file as the main process (bug-report continuity).
  ipcMain.on('log:write', (_e, record: RendererLogRecord) => {
    recordRendererLog(record);
  });
  ipcMain.handle('logs:reveal', () => revealLogFile());
  ipcMain.handle('logs:read', () => readRecentLogs());
  // Fire a native OS notification. Renderer gates this on its own
  // `notificationsEnabled` preference + window-focus check.
  ipcMain.handle(
    'app:notify',
    async (_e, payload: { title: string; body?: string }) => {
      if (!Notification.isSupported()) return false;
      const icon = await getAppIcon();
      const n = new Notification({
        title: payload.title,
        body: payload.body ?? '',
        silent: false,
        ...(icon ? { icon } : {}),
      });
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        n.on('click', () => {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        });
      }
      n.show();
      return true;
    },
  );

  // ---- Updates -----------------------------------------------------------

  ipcMain.handle('update:getInfo', () => getUpdateInfo());
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:download', () => downloadUpdate());
  ipcMain.handle('update:install', () => {
    installUpdateAndRestart();
  });

  // ---- Claude OAuth ------------------------------------------------------

  ipcMain.handle('claude-oauth:start', async () => {
    const url = prepareLoginUrl();
    await shell.openExternal(url);
    return { ok: true as const, url };
  });

  ipcMain.handle('claude-oauth:cancel', () => clearLoginState());

  ipcMain.handle('claude-oauth:exchange', async (_e, code: string) => {
    if (!code || typeof code !== 'string') {
      throw new Error('Authorization code is required.');
    }
    return exchangeCode(code);
  });

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

  // ---- ChatGPT Plus (Codex) OAuth (PKCE browser-redirect via Pi SDK) --------

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

  // ---- Claude OAuth usage -----------------------------------------------

  ipcMain.handle(
    'claude:fetchUsage',
    async (
      _e,
      args: { connectionSlug: string },
    ): Promise<import('./claude/usage').ClaudeUsageEntry[] | { error: string }> => {
      try {
        const meta = listConnections().find((c) => c.slug === args.connectionSlug);
        if (!meta) return { error: `Connection "${args.connectionSlug}" not found.` };
        if (meta.providerType !== 'anthropic' || meta.authType !== 'oauth') {
          return { error: 'Connection is not Claude OAuth.' };
        }

        const auth = await resolveAuthForSlug(args.connectionSlug);
        if (auth.type !== 'anthropic_oauth') {
          return { error: 'Resolved auth is not Claude OAuth.' };
        }

        const { fetchClaudeUsage } = await import('./claude/usage');
        const result = await fetchClaudeUsage(auth.accessToken);
        if ('error' in result) {
          log.error('fetchUsage:', result.error);
        }
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

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
        const { fetchCopilotModels } = await import('./copilot/models');
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
        const { fetchCopilotQuota } = await import('./copilot/quota');
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

  // ---- ChatGPT Plus (Codex) model discovery ---------------------------

  // Official ChatGPT Plus Codex models per openai.com/codex/pricing (May 2026).
  // gpt-5.3-codex-spark is Pro-only research preview — shown with a label
  // so Pro users can use it; Plus users see the error and understand why.
  const CHATGPT_PLUS_MODEL_IDS = new Set(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex']);
  const CHATGPT_PRO_ONLY_IDS = new Set(['gpt-5.3-codex-spark']);

  ipcMain.handle('chatgpt:getModels', async (): Promise<ModelDef[]> => {
    const { getBuiltinModels } = await import('@earendil-works/pi-ai/providers/all');
    const raw = getBuiltinModels('openai-codex') as Array<{
      id: string; name: string; contextWindow: number;
    }>;
    const toModel = (m: typeof raw[0], tier: string) => ({
      id: m.id,
      name: m.name,
      shortName: m.name,
      description: `${tier} · Codex`,
      contextWindow: m.contextWindow ?? 272_000,
    });
    const plus = raw
      .filter((m) => CHATGPT_PLUS_MODEL_IDS.has(m.id))
      .sort((a, b) => {
        if (a.id === 'gpt-5.3-codex') return -1;
        if (b.id === 'gpt-5.3-codex') return 1;
        return b.id.localeCompare(a.id);
      })
      .map((m) => toModel(m, 'Plus & Pro'));
    const pro = raw
      .filter((m) => CHATGPT_PRO_ONLY_IDS.has(m.id))
      .map((m) => toModel(m, 'Pro only'));
    return [...plus, ...pro];
  });


  // ---- Chat streaming ----------------------------------------------------

  ipcMain.handle('chat:send', async (event, req: ChatSendRequest) => {
    if (!req?.id) throw new Error('Missing request id.');

    const ctrl = new AbortController();
    inFlight.set(req.id, ctrl);

    // Renderer-round-trip for collaboration engagement.
    // Used by RequestDecision, RequestPreference, RequestFeedback,
    // RequestGuidance, and RequestApproval tools.
    const askCollaboration = (ereq: EngagementRequest) => {
      if (event.sender.isDestroyed()) {
        return Promise.reject(new Error('Window destroyed'));
      }
      return new Promise<EngagementResponse>((resolve, reject) => {
        pendingCollaborations.set(ereq.reqId, {
          resolve,
          turnId: ereq.turnId,
        });
        const onAbort = () => {
          pendingCollaborations.delete(ereq.reqId);
          reject(new Error('Turn aborted'));
        };
        if (ctrl.signal.aborted) {
          onAbort();
          return;
        }
        ctrl.signal.addEventListener('abort', onAbort, { once: true });
        event.sender.send('chat:collaboration-request', ereq);
      });
    };

    try {
      // Resolve the connection's credential and refresh the OAuth token if
      // it's within 5min of expiry. Errors here are emitted as a structured
      // `chat:event` error rather than rejecting the IPC call so the UI
      // renders them inline like any other agent error.
      let auth;
      try {
        auth = await resolveAuthForSlug(req.connectionSlug);
      } catch (e) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:event', {
            id: req.id,
            type: 'error',
            error: parseError(e),
          });
        }
        return;
      }

      turnInfo.set(req.id, {
        providerType: auth.type === 'copilot_oauth' ? 'pi' : 'anthropic',
        chatSessionId: req.sessionId,
      });

      // On-use revalidation: TTL-gated, fire-and-forget. Keeps an actively
      // used connection's model catalog fresh without waiting for a restart.
      maybeRevalidate(req.connectionSlug);

      // Ensure session state is ready before the first turn.
      // This is a no-op on subsequent turns (init is idempotent when state already exists).
      let autonomyLevel = 50; // Default: balanced
      if (req.sessionId) {
        const sessionMeta = loadSession(req.sessionId)?.meta;
        autonomyLevel = sessionMeta?.autonomyLevel ?? 50;
      }

      const { extendedContext } = getSettings();
      const effectiveModel = apply1MContextSuffix(req.model, extendedContext);

      for await (const chunk of runAgentChat({
        auth,
        connectionSlug: req.connectionSlug,
        piAuthProvider: listConnections().find((c) => c.slug === req.connectionSlug)?.piAuthProvider,
        turnId: req.id,
        chatSessionId: req.sessionId,
        model: effectiveModel,
        prompt: req.prompt,
        attachments: req.attachments,
        cwd: req.cwd,
        resumeSessionId: req.resumeSessionId,
        maxTurns: req.maxTurns,
        permissionMode: req.permissionMode,
        askCollaboration,
        autonomyLevel,
        signal: ctrl.signal,
      })) {
        if (event.sender.isDestroyed()) break;
        event.sender.send('chat:event', { id: req.id, ...chunk });
        if (chunk.type === 'turn_done' || chunk.type === 'error') break;
      }
    } finally {
      // Resolve any outstanding collaboration prompts for this turn.
      for (const [reqId, entry] of pendingCollaborations) {
        if (entry.turnId === req.id) {
          entry.resolve({
            reqId,
            decision: 'denied',
            custom_response: 'Turn aborted',
          });
          pendingCollaborations.delete(reqId);
        }
      }
      inFlight.delete(req.id);
      turnInfo.delete(req.id);
    }
  });

  ipcMain.handle(
    'chat:steer',
    async (
      _e,
      args: { turnId: string; message: string; attachments?: StoredAttachment[] },
    ): Promise<{ ok: boolean; reason?: string }> => {
      const info = turnInfo.get(args.turnId);
      if (!info) return { ok: false, reason: 'turn_not_active' };
      if (!args.message.trim() && !args.attachments?.length)
        return { ok: false, reason: 'empty_message' };
      if (info.providerType === 'pi') {
        if (!info.chatSessionId) return { ok: false, reason: 'no_session' };
        const ok = steerPiTurn({
          chatSessionPath: sessionPath(info.chatSessionId),
          turnId: args.turnId,
          message: args.message,
          attachments: args.attachments,
        });
        return ok ? { ok: true } : { ok: false, reason: 'subprocess_unavailable' };
      }
      const ok = steerAnthropicTurn(args.turnId, args.message, args.attachments);
      return ok ? { ok: true } : { ok: false, reason: 'turn_not_steerable' };
    },
  );

  ipcMain.handle('chat:abort', (_e, id: string) => {
    const ctrl = inFlight.get(id);
    if (ctrl) {
      ctrl.abort();
      inFlight.delete(id);
    }
  });

  ipcMain.handle(
    'chat:generateTitle',
    async (
      _e,
      args: {
        connectionSlug: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        model?: string;
        sessionId?: string;
        cwd?: string;
      },
    ): Promise<string | null> => {
      const auth = await resolveAuthForSlug(args.connectionSlug);
      const connMeta = listConnections().find((c) => c.slug === args.connectionSlug);
      return generateTitle({
        auth,
        messages: args.messages,
        model: args.model,
        connectionSlug: args.connectionSlug,
        chatSessionId: args.sessionId,
        piAuthProvider: connMeta?.piAuthProvider,
        cwd: args.cwd,
      });
    },
  );

  /**
   * Renderer's response to a `chat:collaboration-request` event.
   * Used by intelligent collaboration system (RequestDecision, etc.).
   */
  ipcMain.handle(
    'chat:collaboration-response',
    (_e, payload: EngagementResponse) => {
      const entry = pendingCollaborations.get(payload.reqId);
      if (!entry) return;
      entry.resolve(payload);
      pendingCollaborations.delete(payload.reqId);
    },
  );

  // ---- Planning Workflow ------------------------------------------------

  /**
   * Planning workflow IPC handlers - manages multi-phase execution plans.
   * Plan state is managed by the pi-server subprocess via PlanManager.
   * Events from subprocess update the cache, which is queried here.
   */
  
  ipcMain.handle('planning:getActivePlan', async (_e, sessionId: string) => {
    return getActivePlan(sessionId);
  });


  ipcMain.handle('planning:cancelPlan', async (_e, sessionId: string) => {
    const plan = getActivePlan(sessionId);
    if (plan) {
      plan.status = 'cancelled';
      updatePlan(sessionId, plan);
      // Notify renderer
      BrowserWindow.getAllWindows()[0]?.webContents.send('planning:cancelled', {
        sessionId,
        planId: plan.id,
      });
    }
    updatePlan(sessionId, null);
  });

  ipcMain.handle('planning:approvePhase', async (_e, sessionId: string, phaseId: string, notes?: string) => {
    // Send approval response to subprocess - let PlanManager handle the logic
    const sent = sendPlanApprovalResponse({
      chatSessionPath: sessionPath(sessionId),
      phaseId,
      approved: true,
      notes,
    });
    
    if (!sent) {
      log.warn(`Could not send approval response: subprocess not found for session ${sessionId}`);
    }
    
    // Note: Plan cache will be updated when subprocess emits phase-updated event
  });

  ipcMain.handle('planning:denyPhase', async (_e, sessionId: string, phaseId: string, reason?: string) => {
    // Send denial response to subprocess - let PlanManager handle the logic
    const sent = sendPlanApprovalResponse({
      chatSessionPath: sessionPath(sessionId),
      phaseId,
      approved: false,
      notes: reason,
    });
    
    if (!sent) {
      log.warn(`Could not send denial response: subprocess not found for session ${sessionId}`);
    }
    
    // Note: Plan cache will be updated when subprocess emits phase-updated event
  });

  ipcMain.handle('planning:retryPhase', async (_e, sessionId: string, phaseId: string) => {
    const plan = getActivePlan(sessionId);
    if (!plan) return;

    // Reset phase to pending
    const phase = plan.phases.find((p: Phase) => p.id === phaseId);
    if (phase && phase.status === 'error') {
      phase.status = 'pending';
      phase.error = undefined;
      phase.startedAt = undefined;
      phase.completedAt = undefined;
      updatePlan(sessionId, plan);
    }
  });

  ipcMain.handle('planning:skipPhase', async (_e, sessionId: string, phaseId: string) => {
    const plan = getActivePlan(sessionId);
    if (!plan) return;

    // Mark phase as skipped
    const phase = plan.phases.find((p: Phase) => p.id === phaseId);
    if (phase && (phase.status === 'error' || phase.status === 'blocked')) {
      phase.status = 'skipped';
      updatePlan(sessionId, plan);
    }
  });

  // ---- Connections + AI settings -----------------------------------------

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
  ipcMain.handle('connections:delete', (_e, slug: string) => {
    deleteConnection(slug);
  });
  /**
   * Used by the chat send path: the renderer must hand us a credential to
   * pass to the SDK. We never send credentials *to* the renderer once saved.
   */
  ipcMain.handle('connections:getCredential', (_e, slug: string) =>
    getCredential(slug),
  );
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
        if (meta.providerType === 'openai-compatible' && auth.type === 'local_api') {
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
  ipcMain.handle(
    'connections:listRemoteModels',
    async (_e, args: { baseUrl: string; apiKey?: string }) => {
      const { fetchOpenAICompatibleModelIds } = await import('./openai-compatible/models');
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

  // ---- Sessions ----------------------------------------------------------

  ipcMain.handle('sessions:list', () => listSessions());
  ipcMain.handle('sessions:load', (_e, id: string) => loadSession(id));
  ipcMain.handle(
    'sessions:create',
    (_e, opts?: { workingDirectory?: string; projectId?: string | null }) =>
      createSession(opts),
  );
  ipcMain.handle(
    'sessions:setProject',
    (_e, id: string, projectId: string | null) =>
      setSessionProject(id, projectId),
  );

  // ---- Projects ----------------------------------------------------------

  ipcMain.handle('projects:list', (): Project[] => listProjects());
  ipcMain.handle(
    'projects:create',
    (_e, input: ProjectInput): Project => createProject(input),
  );
  ipcMain.handle(
    'projects:update',
    (_e, id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>):
      | Project
      | null => updateProject(id, patch),
  );
  ipcMain.handle(
    'projects:delete',
    (_e, id: string): { ok: boolean; sessionsCleared: number } => {
      const ok = deleteProject(id);
      const sessionsCleared = ok ? clearProjectFromSessions(id) : 0;
      return { ok, sessionsCleared };
    },
  );
  ipcMain.handle(
    'sessions:appendMessage',
    (_e, id: string, msg: StoredMessage) => appendMessage(id, msg),
  );
  ipcMain.handle(
    'sessions:replaceLastMessage',
    (_e, id: string, msg: StoredMessage) => replaceLastMessage(id, msg),
  );
  ipcMain.handle(
    'sessions:rewriteMessages',
    (_e, id: string, messages: StoredMessage[]) => rewriteMessages(id, messages),
  );
  ipcMain.handle(
    'sessions:updateMeta',
    (
      _event,
      id: string,
      patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
    ) => {
      return updateSessionMeta(id, patch);
    },
  );
  ipcMain.handle(
    'sessions:truncateFrom',
    (_e, id: string, firstDroppedId: string) =>
      truncateMessagesFrom(id, firstDroppedId),
  );
  ipcMain.handle('sessions:delete', (_e, id: string) => {
    deleteSession(id);
  });
  ipcMain.handle('sessions:revealInFolder', (_e, id: string) => {
    shell.showItemInFolder(sessionPath(id));
  });
  ipcMain.handle('sessions:branch', (_e, parentId: string, upToMessageId: string) =>
    branchSession(parentId, upToMessageId),
  );
  ipcMain.handle('sessions:listFiles', (_e, id: string) => listSessionFiles(id));
  ipcMain.handle('sessions:revealFile', (_e, absPath: string) => {
    shell.showItemInFolder(absPath);
  });

  ipcMain.handle(
    'sessions:saveExport',
    async (
      event,
      args: { html: string; suggestedName: string },
    ): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const safe = (args.suggestedName || 'session').replace(/[^a-z0-9._-]+/gi, '-');
      const opts = {
        defaultPath: `${safe}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      };
      const res = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return null;
      await writeFile(res.filePath, args.html, 'utf-8');
      return res.filePath;
    },
  );

  // Publish an HTML export to the ephemeral host (BrewPage). Returns the share
  // link + ownerToken (for later revoke). Privacy: published to an unlisted
  // namespace, auto-expires at TTL; redaction already happened in the renderer.
  ipcMain.handle(
    'sessions:shareExport',
    async (
      _e,
      args: { html: string; filename: string; ttlDays?: number },
    ): Promise<PublishResult> =>
      publishExport({
        html: args.html,
        filename: args.filename,
        ttlDays: args.ttlDays,
      }),
  );

  ipcMain.handle(
    'sessions:revokeExport',
    async (
      _e,
      args: { namespace: string; id: string; ownerToken: string },
    ): Promise<void> => revokeExport(args),
  );

  // ---- Filesystem dialogs ------------------------------------------------

  // ---- Attachments -------------------------------------------------------

  ipcMain.handle('attachments:pickFiles', async (event): Promise<DraftAttachment[]> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      properties: ['openFile', 'multiSelections'] as Array<
        'openFile' | 'multiSelections'
      >,
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: 'Documents', extensions: ['pdf', 'txt', 'md'] },
        {
          name: 'Code',
          extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'yml'],
        },
      ],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled) return [];
    const out: DraftAttachment[] = [];
    for (const p of res.filePaths) {
      try {
        const d = readPathAsDraft(p);
        if (d) out.push(d);
      } catch {
        // Skip unreadable / oversize files. Errors surfaced per-path on
        // explicit drag-and-drop / paste paths instead.
      }
    }
    return out;
  });

  ipcMain.handle(
    'attachments:readPath',
    (_e, p: string): DraftAttachment | null => {
      try {
        return readPathAsDraft(p);
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
  );

  ipcMain.handle(
    'attachments:store',
    async (_e, sessionId: string, draft: DraftAttachment): Promise<StoredAttachment> => {
      return storeDraft(sessionId, draft);
    },
  );

  ipcMain.handle(
    'attachments:readAsBase64',
    (_e, storedPath: string): string | null => readStoredAsBase64(storedPath),
  );

  ipcMain.handle('attachments:reveal', (_e, storedPath: string) => {
    shell.showItemInFolder(storedPath);
  });

  // ---- Skills -----------------------------------------------------------

  ipcMain.handle('skills:getDir', (): string => getSkillsDir());
  ipcMain.handle(
    'skills:getReferenceDocPath',
    (): string => Paths.skillsReferenceDoc(),
  );
  ipcMain.handle('skills:list', (): LoadedSkill[] => loadAllSkills());
  ipcMain.handle(
    'skills:get',
    (_e, slug: string): LoadedSkill | null => loadSkillBySlug(slug),
  );
  ipcMain.handle(
    'skills:listFiles',
    (_e, dirPath: string): SkillFileNode[] => scanSkillDirectory(dirPath),
  );
  ipcMain.handle(
    'skills:delete',
    (_e, slug: string): boolean => deleteSkill(slug),
  );
  ipcMain.handle('skills:invalidateCache', () => invalidateSkillsCache());
  ipcMain.handle('skills:openInEditor', async (_e, dirPath: string) => {
    // `openPath` will use the OS's default handler (e.g. "Open With" pref).
    return shell.openPath(dirPath);
  });
  ipcMain.handle('skills:revealInFinder', (_e, dirPath: string) => {
    shell.showItemInFolder(dirPath);
  });
  ipcMain.handle(
    'skills:validate',
    (_e, dirPath: string, slug: string): { ok: boolean; report: string } => {
      try {
        const content = readFileSync(`${dirPath}/SKILL.md`, 'utf-8');
        const result = validateSkillContent(content, slug);
        return { ok: result.valid, report: formatValidationResult(result) };
      } catch (e) {
        return {
          ok: false,
          report: `✗ Could not read SKILL.md: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  );

  // ---- Agents ---------------------------------------------------------

  ipcMain.handle('agents:getDir', (): string => getAgentsDir());
  ipcMain.handle(
    'agents:list',
    (): LoadedAgent[] => loadAllAgents(),
  );
  ipcMain.handle(
    'agents:get',
    (_e, slug: string): LoadedAgent | null => loadAgentBySlug(slug),
  );
  ipcMain.handle(
    'agents:listFiles',
    (_e, dirPath: string): AgentFileNode[] => scanAgentDirectory(dirPath),
  );
  ipcMain.handle(
    'agents:delete',
    (_e, slug: string): boolean => deleteAgent(slug),
  );
  ipcMain.handle('agents:invalidateCache', () => {
    invalidateAgentsCache();
  });
  ipcMain.handle('agents:openInEditor', async (_e, dirPath: string) => {
    return shell.openPath(dirPath);
  });
  ipcMain.handle('agents:revealInFinder', (_e, dirPath: string) => {
    shell.showItemInFolder(dirPath);
  });
  ipcMain.handle(
    'agents:validate',
    (_e, dirPath: string, slug: string): { ok: boolean; report: string } => {
      try {
        const content = readFileSync(`${dirPath}/AGENT.md`, 'utf-8');
        const result = validateAgentContent(content, slug);
        return { ok: result.valid, report: formatAgentValidationResult(result) };
      } catch (e) {
        return {
          ok: false,
          report: `✗ Could not read AGENT.md: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  );

  // ---- Extensions -------------------------------------------------------

  ipcMain.handle('extensions:getDir', (): string => getExtensionsDir());
  ipcMain.handle(
    'extensions:getReferenceDocPath',
    (): string => Paths.extensionsReferenceDoc(),
  );
  ipcMain.handle(
    'extensions:list',
    (): LoadedExtension[] => loadAllExtensions(),
  );
  ipcMain.handle(
    'extensions:get',
    (_e, slug: string): LoadedExtension | null => loadExtensionBySlug(slug),
  );
  ipcMain.handle(
    'extensions:listFiles',
    (_e, dirPath: string): ExtensionFileNode[] =>
      scanExtensionDirectory(dirPath),
  );
  ipcMain.handle(
    'extensions:delete',
    (_e, slug: string): boolean => {
      const ok = deleteExtension(slug);
      if (ok) getExtensionRegistry().load();
      return ok;
    },
  );
  ipcMain.handle(
    'extensions:setEnabled',
    (_e, slug: string, enabled: boolean): boolean | null => {
      const result = setExtensionEnabled(slug, enabled);
      if (result !== null) getExtensionRegistry().load();
      return result;
    },
  );
  ipcMain.handle('extensions:invalidateCache', () => {
    invalidateExtensionsCache();
    getExtensionRegistry().load();
  });
  ipcMain.handle(
    'extensions:openInEditor',
    async (_e, dirPath: string) => shell.openPath(dirPath),
  );
  ipcMain.handle(
    'extensions:revealInFinder',
    (_e, dirPath: string) => shell.showItemInFolder(dirPath),
  );
  ipcMain.handle(
    'extensions:validate',
    (_e, dirPath: string, slug: string): { ok: boolean; report: string } => {
      const lines: string[] = [];
      let allValid = true;

      try {
        const raw = readFileSync(`${dirPath}/extension.json`, 'utf-8');
        const r = validateExtensionConfigContent(raw, slug);
        if (!r.valid) allValid = false;
        lines.push(formatExtensionValidationResult(r));
      } catch (e) {
        allValid = false;
        lines.push(
          `✗ Could not read extension.json: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      try {
        const raw = readFileSync(`${dirPath}/guide.md`, 'utf-8');
        const r = validateExtensionGuideContent(raw);
        if (!r.valid) allValid = false;
        lines.push('---');
        lines.push(formatExtensionValidationResult(r));
      } catch (e) {
        allValid = false;
        lines.push(
          `✗ Could not read guide.md: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      return { ok: allValid, report: lines.join('\n') };
    },
  );

  // ---- Extension secrets + consent --------------------------------------

  // Consent/secret changes alter which mcp-backed extensions are eligible.
  // Broadcasting lets open panels re-read `mcp.status` and refresh their
  // badges immediately, rather than waiting for a manual refresh.
  const broadcastMcpStatusChanged = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('mcp-status');
    }
  };

  ipcMain.handle('extensions:secrets.encryptionAvailable', (): boolean =>
    isSecretsEncryptionAvailable(),
  );
  ipcMain.handle(
    'extensions:secrets.listKeys',
    (_e, slug: string): string[] => listExtensionSecretKeys(slug),
  );
  ipcMain.handle(
    'extensions:secrets.set',
    (_e, slug: string, keyName: string, value: string): void => {
      setExtensionSecret(slug, keyName, value);
      broadcastMcpStatusChanged();
    },
  );
  ipcMain.handle(
    'extensions:secrets.delete',
    (_e, slug: string, keyName: string): void => {
      deleteExtensionSecret(slug, keyName);
      broadcastMcpStatusChanged();
    },
  );
  ipcMain.handle(
    'extensions:secrets.declared',
    (_e, slug: string): string[] => {
      const ext = loadExtensionBySlug(slug);
      return ext ? listDeclaredSecrets(ext) : [];
    },
  );
  ipcMain.handle(
    'extensions:secrets.missing',
    (_e, slug: string): string[] => {
      const ext = loadExtensionBySlug(slug);
      return ext ? listMissingSecrets(ext) : [];
    },
  );
  ipcMain.handle(
    'extensions:consent.has',
    (_e, slug: string): boolean => {
      const ext = loadExtensionBySlug(slug);
      return ext ? hasConsent(ext) : false;
    },
  );
  ipcMain.handle(
    'extensions:consent.grant',
    (_e, slug: string): boolean => {
      const ext = loadExtensionBySlug(slug);
      if (!ext) return false;
      grantConsent(ext);
      broadcastMcpStatusChanged();
      return true;
    },
  );
  ipcMain.handle(
    'extensions:consent.revoke',
    (_e, slug: string): boolean => {
      const ext = loadExtensionBySlug(slug);
      if (!ext) return false;
      revokeConsent(ext);
      broadcastMcpStatusChanged();
      return true;
    },
  );
  ipcMain.handle(
    'extensions:mcp.status',
    (): Array<{ slug: string; ok: boolean; reason?: string }> =>
      listMcpExtensionsStatus(),
  );

  // ---- File search (mention picker) -------------------------------------

  ipcMain.handle(
    'files:search',
    (
      _e,
      args: { root: string; query: string; limit?: number },
    ): FileSearchEntry[] => {
      if (!isWithinAllowedRoots(args.root)) return [];
      return searchFiles({ root: args.root, query: args.query, limit: args.limit });
    },
  );

  ipcMain.handle(
    'files:grep',
    async (
      _e,
      args: { root: string; query: string; useRegex?: boolean; caseSensitive?: boolean; limit?: number },
    ) => {
      if (!isWithinAllowedRoots(args.root)) return [];
      const { grepFiles } = await import('./files/grep');
      return grepFiles(args);
    },
  );

  // ---- File tree (file explorer panel) ----------------------------------

  ipcMain.handle(
    'files:listDirectory',
    (
      _e,
      args: { path: string; root: string; includeHidden?: boolean },
    ) => {
      if (!isWithinAllowedRoots(args.path)) return [];
      return listDirectory(args);
    },
  );

  ipcMain.handle(
    'files:buildFileTree',
    (
      _e,
      args: { path: string; root: string; includeHidden?: boolean; maxDepth?: number },
    ) => {
      if (!isWithinAllowedRoots(args.path)) return [];
      return buildFileTree(args);
    },
  );

  // ---- Filesystem dialogs ------------------------------------------------

  ipcMain.handle('fs:pickDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >,
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('fs:pickFile', async (event, opts?: { defaultPath?: string; title?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts = {
      title: opts?.title ?? 'Select file',
      defaultPath: opts?.defaultPath ?? (process.platform === 'win32' ? 'C:\\Windows\\System32' : '/bin'),
      properties: ['openFile'] as Array<'openFile'>,
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('fs:readFile', (_e, absolutePath: string): string | null => {
    // Guard: skip files larger than 2 MB to keep the renderer responsive.
    const MAX_BYTES = 2 * 1024 * 1024;
    const { statSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    // Confine to known roots + resolve symlinks before any read.
    const safePath = resolveWithinAllowedRoots(absolutePath);
    if (!safePath) return null;
    try {
      if (statSync(safePath).size > MAX_BYTES) return null;
      return readFileSync(safePath, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFileBase64', (_e, absolutePath: string): string | null => {
    // Used for binary files (images). 20 MB cap — larger assets are rarely
    // useful to preview and would bloat the IPC payload.
    const MAX_BYTES = 20 * 1024 * 1024;
    const { statSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    // Confine to known roots + resolve symlinks before any read.
    const safePath = resolveWithinAllowedRoots(absolutePath);
    if (!safePath) return null;
    try {
      if (statSync(safePath).size > MAX_BYTES) return null;
      return readFileSync(safePath).toString('base64');
    } catch {
      return null;
    }
  });



  // ---- Git diff review (Cmd+G modal) ------------------------------------

  ipcMain.handle('git:status', async (_e, cwd: string) => {
    const { getGitStatus } = await import('./git/status');
    return getGitStatus(cwd);
  });

  ipcMain.handle(
    'git:diff',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; absolutePath: string; status: string },
    ) => {
      // Same C5 read-back class as fs:readFile: `git:diff` returns on-disk file
      // content to the renderer (status ?/A/M), so confine it to known roots.
      // The repo must be a known root, and the disk-read path is canonicalized
      // within roots (null for deleted files, where only HEAD content is used).
      const empty = { original: '', modified: '', language: 'plaintext' };
      if (!isWithinAllowedRoots(args.repoRoot)) return empty;
      const safeAbsolutePath = resolveWithinAllowedRoots(args.absolutePath) ?? '';
      const { getFileDiff } = await import('./git/diff');
      return getFileDiff(args.repoRoot, args.relativePath, safeAbsolutePath, args.status);
    },
  );

  ipcMain.handle(
    'git:commitFiles',
    async (
      _e,
      args: {
        repoRoot: string;
        files: Array<{ relativePath: string; absolutePath: string; status: string; content?: string }>;
        message: string;
        amend?: boolean;
      },
    ) => {
      const { commitFiles } = await import('./git/commit');
      return commitFiles(
        args.repoRoot,
        args.files as import('./git/commit').FileToCommit[],
        args.message,
        args.amend,
      );
    },
  );

  ipcMain.handle('git:lastCommitMessage', async (_e, repoRoot: string) => {
    const { getLastCommitMessage } = await import('./git/commit');
    return getLastCommitMessage(repoRoot);
  });

  ipcMain.handle('git:branchName', async (_e, repoRoot: string) => {
    const { getBranchName } = await import('./git/commit');
    return getBranchName(repoRoot);
  });

  ipcMain.handle('git:lastCommitFiles', async (_e, repoRoot: string) => {
    const { getLastCommitFiles } = await import('./git/commit');
    return getLastCommitFiles(repoRoot);
  });

  ipcMain.handle('git:lastCommitDiff', async (_e, repoRoot: string) => {
    const { getLastCommitDiff } = await import('./git/commit');
    return getLastCommitDiff(repoRoot);
  });

  ipcMain.handle(
    'git:generateCommitMessage',
    async (
      _e,
      args: { connectionSlug: string; model?: string; diffContext: string; userContext?: string; sessionId?: string; cwd?: string },
    ) => {
      try {
        const { resolveAuthForSlug } = await import('./auth/resolve');
        const { listConnections } = await import('./storage/connections');
        const { generateCommitMessage } = await import('./agent/commit-message');
        const auth = await resolveAuthForSlug(args.connectionSlug);
        const conn = listConnections().find((c) => c.slug === args.connectionSlug);
        return await generateCommitMessage({
          auth,
          diffContext: args.diffContext,
          userContext: args.userContext,
          model: args.model,
          connectionSlug: args.connectionSlug,
          chatSessionId: args.sessionId,
          piAuthProvider: conn?.piAuthProvider,
          cwd: args.cwd,
        });
      } catch (e) {
        log.error('generateCommitMessage:', e);
        return null;
      }
    },
  );

  // ---- Git merge / conflict resolution ------------------------------------

  ipcMain.handle('git:mergeState', async (_e, repoRoot: string) => {
    const { getMergeState } = await import('./git/merge');
    return getMergeState(repoRoot);
  });

  ipcMain.handle(
    'git:conflictContent',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; absolutePath: string },
    ) => {
      const { getConflictContent } = await import('./git/merge');
      return getConflictContent(args.repoRoot, args.relativePath, args.absolutePath);
    },
  );

  ipcMain.handle(
    'git:resolveConflict',
    async (
      _e,
      args: { repoRoot: string; relativePath: string; absolutePath: string; content: string },
    ) => {
      const { resolveConflict } = await import('./git/merge');
      return resolveConflict(args.repoRoot, args.relativePath, args.absolutePath, args.content);
    },
  );

  ipcMain.handle(
    'git:abortOperation',
    async (_e, args: { repoRoot: string; type: string }) => {
      const { abortOperation } = await import('./git/merge');
      return abortOperation(
        args.repoRoot,
        args.type as import('./git/merge').MergeOperationType,
      );
    },
  );

  ipcMain.handle(
    'git:continueMerge',
    async (_e, args: { repoRoot: string; message: string; type: string }) => {
      const { continueMerge } = await import('./git/merge');
      return continueMerge(
        args.repoRoot,
        args.message,
        args.type as import('./git/merge').MergeOperationType,
      );
    },
  );

  // ---- Terminal ----------------------------------------------------------

  ipcMain.handle('terminal:resolveShell', () =>
    terminalManager.resolveShell(),
  );

  ipcMain.handle(
    'terminal:create',
    (_e, opts: { cwd: string; shell?: string }) =>
      terminalManager.create(opts.cwd, opts.shell),
  );

  ipcMain.handle(
    'terminal:write',
    (_e, args: { tabId: string; data: string }) =>
      terminalManager.write(args.tabId, args.data),
  );

  ipcMain.handle(
    'terminal:resize',
    (_e, args: { tabId: string; cols: number; rows: number }) =>
      terminalManager.resize(args.tabId, args.cols, args.rows),
  );

  ipcMain.handle('terminal:getScrollback', (_e, tabId: string) =>
    terminalManager.getScrollback(tabId),
  );

  ipcMain.handle('terminal:listTabs', () =>
    terminalManager.listTabs(),
  );

  ipcMain.handle('terminal:kill', (_e, tabId: string) =>
    terminalManager.kill(tabId),
  );

  ipcMain.handle('terminal:listShells', (): string[] => allowedShells());
}
