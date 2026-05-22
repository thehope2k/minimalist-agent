import { contextBridge, ipcRenderer } from 'electron';
import { homedir as osHomedir } from 'node:os';

type PermissionMode = 'plan' | 'ask' | 'auto';
type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

interface PermissionRequest {
  reqId: string;
  turnId: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ChatSendRequest {
  id: string;
  connectionSlug: string;
  model: string;
  prompt: string;
  cwd?: string;
  resumeSessionId?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  sessionId?: string;
}

interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

type ErrorCode =
  | 'invalid_api_key'
  | 'expired_oauth_token'
  | 'rate_limited'
  | 'service_error'
  | 'network_error'
  | 'proxy_error'
  | 'billing_error'
  | 'model_no_tool_support'
  | 'invalid_model'
  | 'invalid_request'
  | 'image_too_large'
  | 'provider_error'
  | 'max_turns_exceeded'
  | 'budget_exceeded'
  | 'execution_error'
  | 'structured_output_retries_exhausted'
  | 'aborted'
  | 'unknown_error';

interface AgentError {
  code: ErrorCode;
  title: string;
  message: string;
  canRetry: boolean;
  retryDelayMs?: number;
  originalError?: string;
}

type ChatStreamEvent =
  | { id: string; type: 'text_delta'; text: string }
  | { id: string; type: 'text_complete'; text: string }
  | { id: string; type: 'thinking_delta'; text: string }
  | {
      id: string;
      type: 'tool_start';
      toolUseId: string;
      name: string;
      input?: unknown;
    }
  | {
      id: string;
      type: 'tool_input_delta';
      toolUseId: string;
      partialJson: string;
    }
  | {
      id: string;
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      id: string;
      type: 'turn_done';
      sessionId?: string;
      stopReason?: string;
      usage?: AgentUsage;
    }
  | {
      id: string;
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | { id: string; type: 'error'; error: AgentError };

interface CopilotQuota {
  percentRemaining: number;
  entitlement: number | null;
  used: number | null;
  overageCount: number;
  overagePermitted: boolean;
  unlimited: boolean;
  resetDate: string;
  planType: string | null;
  fallback: boolean;
}

interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
}


type PiAuthProvider = import('../shared/pi-types').PiAuthProvider;

interface ConnectionMeta {
  slug: string;
  name: string;
  providerType: 'anthropic' | 'pi' | 'local';
  authType: 'api_key' | 'oauth';
  piAuthProvider?: PiAuthProvider;
  /** Base URL for local model server (providerType === 'local'). */
  baseUrl?: string;
  defaultModel: string;
  models: ModelDef[];
  createdAt: number;
}

type Credential =
  | { type: 'api_key'; apiKey: string }
  | {
      type: 'oauth';
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      scopes?: string[];
    };

interface AiSettings {
  defaultModel?: string;
  defaultThinking: 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  extendedContext?: boolean;
  recentFolders?: string[];
  maxTurns?: number;
  defaultPermissionMode?: PermissionMode;
}

interface UserLocation {
  city?: string;
  region?: string;
  country?: string;
}

interface UserPreferences {
  name?: string;
  timezone?: string;
  location?: UserLocation;
  language?: string;
  notes?: string;
  includeCoAuthoredBy?: boolean;
}

type ChatRole = 'user' | 'assistant';

type StoredMessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input?: unknown;
      partialInputJson?: string;
      result?: { content: string; isError?: boolean };
      status: 'running' | 'done' | 'error';
    };

interface StoredMessage {
  id: string;
  role: ChatRole;
  content: string;
  parts?: StoredMessagePart[];
  model?: string;
  error?: string;
  stopReason?: string;
  createdAt: number;
  markerKind?: 'compaction';
  compactionMeta?: {
    trigger: 'manual' | 'auto';
    preTokens: number;
    postTokens?: number;
    durationMs?: number;
  };
}

interface SessionUsage {
  inputTokens?: number;
  outputTokens?: number;
}

interface SessionMeta {
  id: string;
  title: string;
  workingDirectory?: string;
  sdkSessionId?: string;
  archived: boolean;
  createdAt: number;
  lastMessageAt: number;
  usage?: SessionUsage;
  permissionMode?: PermissionMode;
  projectId?: string | null;
  connectionSlug?: string;
  model?: string;
}

interface Project {
  id: string;
  name: string;
  rootPath: string;
  color?: string;
  defaultPermissionMode?: PermissionMode;
  defaultConnectionSlug?: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectInput {
  name: string;
  rootPath: string;
  color?: string;
  defaultPermissionMode?: PermissionMode;
  defaultConnectionSlug?: string;
}

type SessionSummary = SessionMeta;

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdateInfo {
  state: UpdateState;
  currentVersion: string;
  latestVersion: string | null;
  progress: number;
  error?: string;
}

const api = {
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
    getKeepAwake: (): Promise<boolean> =>
      ipcRenderer.invoke('app:getKeepAwake'),
    setKeepAwake: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('app:setKeepAwake', enabled),
    setAgentActive: (active: boolean): Promise<void> =>
      ipcRenderer.invoke('app:setAgentActive', active),
    notify: (title: string, body?: string): Promise<boolean> =>
      ipcRenderer.invoke('app:notify', { title, body }),
  },
  claudeOAuth: {
    start: (): Promise<{ ok: true; url: string }> =>
      ipcRenderer.invoke('claude-oauth:start'),
    cancel: (): Promise<void> => ipcRenderer.invoke('claude-oauth:cancel'),
    exchange: (
      code: string,
    ): Promise<{
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      scopes?: string[];
    }> => ipcRenderer.invoke('claude-oauth:exchange', code),
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
      const handler = (
        _e: unknown,
        payload: { userCode: string; verificationUri: string },
      ) => cb(payload);
      ipcRenderer.on('copilot-oauth:device-code', handler);
      return () =>
        ipcRenderer.removeListener('copilot-oauth:device-code', handler);
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
      return () =>
        ipcRenderer.removeListener('chatgpt-oauth:browser-open', handler);
    },
  },
  chatgpt: {
    getModels: (): Promise<ModelDef[]> => ipcRenderer.invoke('chatgpt:getModels'),
  },
  copilot: {
    fetchModels: (
      args: { refreshToken?: string; connectionSlug?: string },
    ): Promise<{ models: ModelDef[] } | { error: string }> =>
      ipcRenderer.invoke('copilot:fetchModels', args),
    fetchQuota: (
      args: { connectionSlug: string },
    ): Promise<CopilotQuota | { error: string }> =>
      ipcRenderer.invoke('copilot:fetchQuota', args),
  },
  chat: {
    send: (req: ChatSendRequest): Promise<void> =>
      ipcRenderer.invoke('chat:send', req),
    abort: (id: string): Promise<void> => ipcRenderer.invoke('chat:abort', id),
    steer: (
      turnId: string,
      message: string,
      attachments?: object[],
    ): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('chat:steer', { turnId, message, attachments }),
    generateTitle: (args: {
      connectionSlug: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      model?: string;
      sessionId?: string;
      cwd?: string;
    }): Promise<string | null> => ipcRenderer.invoke('chat:generateTitle', args),
    onEvent: (cb: (e: ChatStreamEvent) => void): (() => void) => {
      const handler = (_e: unknown, payload: ChatStreamEvent) => cb(payload);
      ipcRenderer.on('chat:event', handler);
      return () => ipcRenderer.removeListener('chat:event', handler);
    },
    onPermissionRequest: (
      cb: (req: PermissionRequest) => void,
    ): (() => void) => {
      const handler = (_e: unknown, payload: PermissionRequest) => cb(payload);
      ipcRenderer.on('chat:permission-request', handler);
      return () => ipcRenderer.removeListener('chat:permission-request', handler);
    },
    respondPermission: (
      reqId: string,
      decision: PermissionDecision,
    ): Promise<void> =>
      ipcRenderer.invoke('chat:permission-response', { reqId, decision }),
  },
  connections: {
    list: (): Promise<ConnectionMeta[]> =>
      ipcRenderer.invoke('connections:list'),
    getDefaultSlug: (): Promise<string | undefined> =>
      ipcRenderer.invoke('connections:getDefaultSlug'),
    setDefaultSlug: (slug: string | null): Promise<void> =>
      ipcRenderer.invoke('connections:setDefaultSlug', slug),
    save: (meta: ConnectionMeta, credential: Credential): Promise<void> =>
      ipcRenderer.invoke('connections:save', { meta, credential }),
    delete: (slug: string): Promise<void> =>
      ipcRenderer.invoke('connections:delete', slug),
    getCredential: (slug: string): Promise<Credential | null> =>
      ipcRenderer.invoke('connections:getCredential', slug),
    isEncryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('connections:isEncryptionAvailable'),
    test: (slug: string): Promise<{ ok: true } | { ok: false; error: AgentError }> =>
      ipcRenderer.invoke('connections:test', slug),
  },
  settings: {
    get: (): Promise<AiSettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: AiSettings): Promise<void> =>
      ipcRenderer.invoke('settings:save', settings),
    pushRecentFolder: (folder: string): Promise<AiSettings> =>
      ipcRenderer.invoke('settings:pushRecentFolder', folder),
    removeRecentFolder: (folder: string): Promise<AiSettings> =>
      ipcRenderer.invoke('settings:removeRecentFolder', folder),
  },
  preferences: {
    get: (): Promise<UserPreferences> => ipcRenderer.invoke('preferences:get'),
    save: (prefs: UserPreferences): Promise<void> =>
      ipcRenderer.invoke('preferences:save', prefs),
  },
  sessions: {
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
    load: (
      id: string,
    ): Promise<{ meta: SessionMeta; messages: StoredMessage[] } | null> =>
      ipcRenderer.invoke('sessions:load', id),
    create: (opts?: {
      workingDirectory?: string;
      projectId?: string | null;
    }): Promise<SessionMeta> => ipcRenderer.invoke('sessions:create', opts),
    setProject: (id: string, projectId: string | null): Promise<SessionMeta> =>
      ipcRenderer.invoke('sessions:setProject', id, projectId),
    appendMessage: (id: string, msg: StoredMessage): Promise<void> =>
      ipcRenderer.invoke('sessions:appendMessage', id, msg),
    replaceLastMessage: (id: string, msg: StoredMessage): Promise<void> =>
      ipcRenderer.invoke('sessions:replaceLastMessage', id, msg),
    updateMeta: (
      id: string,
      patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
    ): Promise<SessionMeta> =>
      ipcRenderer.invoke('sessions:updateMeta', id, patch),
    truncateFrom: (id: string, firstDroppedId: string): Promise<number> =>
      ipcRenderer.invoke('sessions:truncateFrom', id, firstDroppedId),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('sessions:delete', id),
    revealInFolder: (id: string): Promise<void> =>
      ipcRenderer.invoke('sessions:revealInFolder', id),
    listFiles: (id: string): Promise<unknown[]> =>
      ipcRenderer.invoke('sessions:listFiles', id),
    revealFile: (absPath: string): Promise<void> =>
      ipcRenderer.invoke('sessions:revealFile', absPath),
  },
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
    create: (input: ProjectInput): Promise<Project> =>
      ipcRenderer.invoke('projects:create', input),
    update: (
      id: string,
      patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
    ): Promise<Project | null> =>
      ipcRenderer.invoke('projects:update', id, patch),
    delete: (
      id: string,
    ): Promise<{ ok: boolean; sessionsCleared: number }> =>
      ipcRenderer.invoke('projects:delete', id),
  },
  fs: {
    pickDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('fs:pickDirectory'),
    readFile: (absolutePath: string): Promise<string | null> =>
      ipcRenderer.invoke('fs:readFile', absolutePath),
  },
  files: {
    search: (args: { root: string; query: string; limit?: number }): Promise<unknown[]> =>
      ipcRenderer.invoke('files:search', args),
    grep: (args: { root: string; query: string; useRegex?: boolean; caseSensitive?: boolean; limit?: number }): Promise<unknown[]> =>
      ipcRenderer.invoke('files:grep', args),
  },
  skills: {
    getDir: (): Promise<string> => ipcRenderer.invoke('skills:getDir'),
    getReferenceDocPath: (): Promise<string> =>
      ipcRenderer.invoke('skills:getReferenceDocPath'),
    list: (): Promise<unknown[]> => ipcRenderer.invoke('skills:list'),
    get: (slug: string): Promise<unknown | null> =>
      ipcRenderer.invoke('skills:get', slug),
    listFiles: (dirPath: string): Promise<unknown[]> =>
      ipcRenderer.invoke('skills:listFiles', dirPath),
    delete: (slug: string): Promise<boolean> =>
      ipcRenderer.invoke('skills:delete', slug),
    invalidateCache: (): Promise<void> =>
      ipcRenderer.invoke('skills:invalidateCache'),
    openInEditor: (dirPath: string): Promise<string> =>
      ipcRenderer.invoke('skills:openInEditor', dirPath),
    revealInFinder: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('skills:revealInFinder', dirPath),
    validate: (
      dirPath: string,
      slug: string,
    ): Promise<{ ok: boolean; report: string }> =>
      ipcRenderer.invoke('skills:validate', dirPath, slug),
  },
  extensions: {
    getDir: (): Promise<string> => ipcRenderer.invoke('extensions:getDir'),
    getReferenceDocPath: (): Promise<string> =>
      ipcRenderer.invoke('extensions:getReferenceDocPath'),
    list: (): Promise<unknown[]> => ipcRenderer.invoke('extensions:list'),
    get: (slug: string): Promise<unknown | null> =>
      ipcRenderer.invoke('extensions:get', slug),
    listFiles: (dirPath: string): Promise<unknown[]> =>
      ipcRenderer.invoke('extensions:listFiles', dirPath),
    delete: (slug: string): Promise<boolean> =>
      ipcRenderer.invoke('extensions:delete', slug),
    setEnabled: (slug: string, enabled: boolean): Promise<boolean | null> =>
      ipcRenderer.invoke('extensions:setEnabled', slug, enabled),
    invalidateCache: (): Promise<void> =>
      ipcRenderer.invoke('extensions:invalidateCache'),
    openInEditor: (dirPath: string): Promise<string> =>
      ipcRenderer.invoke('extensions:openInEditor', dirPath),
    revealInFinder: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('extensions:revealInFinder', dirPath),
    validate: (
      dirPath: string,
      slug: string,
    ): Promise<{ ok: boolean; report: string }> =>
      ipcRenderer.invoke('extensions:validate', dirPath, slug),

    /* secrets */
    secretsEncryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('extensions:secrets.encryptionAvailable'),
    listSecretKeys: (slug: string): Promise<string[]> =>
      ipcRenderer.invoke('extensions:secrets.listKeys', slug),
    setSecret: (slug: string, keyName: string, value: string): Promise<void> =>
      ipcRenderer.invoke('extensions:secrets.set', slug, keyName, value),
    deleteSecret: (slug: string, keyName: string): Promise<void> =>
      ipcRenderer.invoke('extensions:secrets.delete', slug, keyName),
    declaredSecrets: (slug: string): Promise<string[]> =>
      ipcRenderer.invoke('extensions:secrets.declared', slug),
    missingSecrets: (slug: string): Promise<string[]> =>
      ipcRenderer.invoke('extensions:secrets.missing', slug),

    /* consent */
    hasConsent: (slug: string): Promise<boolean> =>
      ipcRenderer.invoke('extensions:consent.has', slug),
    grantConsent: (slug: string): Promise<boolean> =>
      ipcRenderer.invoke('extensions:consent.grant', slug),
    revokeConsent: (slug: string): Promise<boolean> =>
      ipcRenderer.invoke('extensions:consent.revoke', slug),

    /* mcp diagnostics */
    mcpStatus: (): Promise<Array<{ slug: string; ok: boolean; reason?: string }>> =>
      ipcRenderer.invoke('extensions:mcp.status'),
  },
  attachments: {
    pickFiles: (): Promise<unknown[]> => ipcRenderer.invoke('attachments:pickFiles'),
    readPath: (path: string): Promise<unknown> =>
      ipcRenderer.invoke('attachments:readPath', path),
    store: (sessionId: string, draft: unknown): Promise<unknown> =>
      ipcRenderer.invoke('attachments:store', sessionId, draft),
    readAsBase64: (storedPath: string): Promise<string | null> =>
      ipcRenderer.invoke('attachments:readAsBase64', storedPath),
    reveal: (storedPath: string): Promise<void> =>
      ipcRenderer.invoke('attachments:reveal', storedPath),
  },
  sdd: {
    initSessionState: (sessionId: string, cwd: string, mode: 'auto' | 'off') =>
      ipcRenderer.invoke('sdd:initSessionState', sessionId, cwd, mode),
    getSessionState: (sessionId: string) =>
      ipcRenderer.invoke('sdd:getSessionState', sessionId),
    setMapping: (sessionId: string, patch: import('../shared/sdd-types').SddMappingPatch) =>
      ipcRenderer.invoke('sdd:setMapping', sessionId, patch),
    setMode: (sessionId: string, mode: 'auto' | 'off') =>
      ipcRenderer.invoke('sdd:setMode', sessionId, mode),
    setActiveFeature: (sessionId: string, slug: string | null) =>
      ipcRenderer.invoke('sdd:setActiveFeature', sessionId, slug),
    readArtifact: (absolutePath: string) =>
      ipcRenderer.invoke('sdd:readArtifact', absolutePath),
    toggleTaskCheckbox: (absolutePath: string, checkboxIndex: number) =>
      ipcRenderer.invoke('sdd:toggleTaskCheckbox', absolutePath, checkboxIndex),
    runInit: (targetDir: string) => ipcRenderer.invoke('sdd:runInit', targetDir),
    cleanupSession: (sessionId: string) => ipcRenderer.invoke('sdd:cleanupSession', sessionId),
    onArtifactChanged: (cb: (sessionId: string) => void) => {
      const listener = (_e: unknown, sessionId: string) => cb(sessionId);
      ipcRenderer.on('sdd:artifact-changed', listener);
      return () => ipcRenderer.removeListener('sdd:artifact-changed', listener);
    },
    onStateChanged: (cb: (sessionId: string) => void) => {
      const listener = (_e: unknown, sessionId: string) => cb(sessionId);
      ipcRenderer.on('sdd:state-changed', listener);
      return () => ipcRenderer.removeListener('sdd:state-changed', listener);
    },
  },
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
      files: Array<{ relativePath: string; absolutePath: string; status: string; content?: string }>;
      message: string;
      amend?: boolean;
    }) => ipcRenderer.invoke('git:commitFiles', args),
    lastCommitMessage: (repoRoot: string) => ipcRenderer.invoke('git:lastCommitMessage', repoRoot),
    branchName: (repoRoot: string) => ipcRenderer.invoke('git:branchName', repoRoot),
    lastCommitFiles: (repoRoot: string) => ipcRenderer.invoke('git:lastCommitFiles', repoRoot),
    lastCommitDiff: (repoRoot: string) => ipcRenderer.invoke('git:lastCommitDiff', repoRoot),
    generateCommitMessage: (args: {
      connectionSlug: string;
      model?: string;
      diffContext: string;
      sessionId?: string;
      cwd?: string;
    }) => ipcRenderer.invoke('git:generateCommitMessage', args),
  },
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('env', { homedir: osHomedir() });
