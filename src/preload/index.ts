import { contextBridge, ipcRenderer } from 'electron';
import { homedir as osHomedir } from 'node:os';

type PermissionMode = 'plan' | 'auto';

type EngagementType = 'decision' | 'preference' | 'feedback' | 'guidance' | 'approval';

interface EngagementRequest {
  reqId: string;
  turnId: string;
  sessionId: string;
  type: EngagementType;
  payload: Record<string, unknown>;
}

interface EngagementResponse {
  reqId: string;
  decision: 'approved' | 'denied' | 'custom';
  selected_option?: string;
  custom_response?: string;
  feedback?: string;
}

type PlanStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'error';

type PhaseStatus = 'pending' | 'running' | 'complete' | 'blocked' | 'error' | 'skipped';

interface Phase {
  id: string;
  index: number;
  name: string;
  description: string;
  actions: string[];
  isSafe: boolean;
  risk: number;
  status: PhaseStatus;
  startedAt?: number;
  completedAt?: number;
  findings?: string;
  error?: string;
}

interface PlanRevision {
  version: number;
  timestamp: number;
  reason: string;
  changedPhases: number[];
  changeSummary: string;
}

interface Plan {
  id: string;
  version: number;
  task: string;
  phases: Phase[];
  status: PlanStatus;
  createdAt: number;
  lastUpdatedAt: number;
  revisions: PlanRevision[];
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

type NestedChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'text_complete'; text: string }
  | { type: 'thinking_delta'; text: string }
  | {
      type: 'tool_start';
      toolUseId: string;
      name: string;
      input?: unknown;
    }
  | {
      type: 'tool_input_delta';
      toolUseId: string;
      partialJson: string;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      type: 'turn_done';
      sessionId?: string;
      stopReason?: string;
      usage?: AgentUsage;
    }
  | {
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | { type: 'error'; error: AgentError; sessionId?: string };

interface SubagentProgressUpdate {
  kind: 'subagent';
  execId: string;
  agentSlug: string;
  agentName?: string;
  phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error';
  detail?: string;
  event?: NestedChatStreamEvent;
  at?: number;
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
      type: 'tool_progress';
      toolUseId: string;
      update: SubagentProgressUpdate;
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

interface ClaudeUsageEntry {
  rateLimitType: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage';
  utilization: number;
  resetsAt?: number;
  status: 'allowed' | 'allowed_warning' | 'rejected';
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
  modelsFetchedAt?: number;
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

interface TelemetrySettings {
  enabled: boolean;
  captureContent: boolean;
  exporter: 'file' | 'otlp' | 'console';
  outfile: string;
  otlpEndpoint: string;
  userName: string;
  teamId: string;
  resourceAttributes: string;
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

interface SharedExportResult {
  url: string;
  namespace: string;
  id: string;
  ownerToken: string;
  expiresAt: string;
  ttlDays: number;
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

interface TerminalTabInfo {
  tabId: string;
  title: string;
  cwd: string;
  shell: string;
  pid: number;
  alive: boolean;
}

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
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
    getKeepAwake: (): Promise<boolean> =>
      ipcRenderer.invoke('app:getKeepAwake'),
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
  claude: {
    fetchUsage: (
      args: { connectionSlug: string },
    ): Promise<ClaudeUsageEntry[] | { error: string }> =>
      ipcRenderer.invoke('claude:fetchUsage', args),
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
    onCollaborationRequest: (
      cb: (req: EngagementRequest) => void,
    ): (() => void) => {
      const handler = (_e: unknown, payload: EngagementRequest) => cb(payload);
      ipcRenderer.on('chat:collaboration-request', handler);
      return () => ipcRenderer.removeListener('chat:collaboration-request', handler);
    },
    respondCollaboration: (response: EngagementResponse): Promise<void> =>
      ipcRenderer.invoke('chat:collaboration-response', response),
  },
  planning: {
    getActivePlan: (sessionId: string): Promise<Plan | null> =>
      ipcRenderer.invoke('planning:getActivePlan', sessionId),
    cancelPlan: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('planning:cancelPlan', sessionId),
    approvePhase: (sessionId: string, phaseId: string, notes?: string): Promise<void> =>
      ipcRenderer.invoke('planning:approvePhase', sessionId, phaseId, notes),
    denyPhase: (sessionId: string, phaseId: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke('planning:denyPhase', sessionId, phaseId, reason),
    retryPhase: (sessionId: string, phaseId: string): Promise<void> =>
      ipcRenderer.invoke('planning:retryPhase', sessionId, phaseId),
    skipPhase: (sessionId: string, phaseId: string): Promise<void> =>
      ipcRenderer.invoke('planning:skipPhase', sessionId, phaseId),
    onPlanCreated: (cb: (sessionId: string, plan: Plan) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; plan: Plan }) =>
        cb(payload.sessionId, payload.plan);
      ipcRenderer.on('planning:created', handler);
      return () => ipcRenderer.removeListener('planning:created', handler);
    },
    onPlanUpdated: (cb: (sessionId: string, plan: Plan) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; plan: Plan }) =>
        cb(payload.sessionId, payload.plan);
      ipcRenderer.on('planning:updated', handler);
      return () => ipcRenderer.removeListener('planning:updated', handler);
    },
    onPhaseUpdated: (cb: (sessionId: string, planId: string, phase: Phase) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; planId: string; phase: Phase }) =>
        cb(payload.sessionId, payload.planId, payload.phase);
      ipcRenderer.on('planning:phase-updated', handler);
      return () => ipcRenderer.removeListener('planning:phase-updated', handler);
    },
    onPlanRevised: (cb: (sessionId: string, plan: Plan, revision: PlanRevision) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; plan: Plan; revision: PlanRevision }) =>
        cb(payload.sessionId, payload.plan, payload.revision);
      ipcRenderer.on('planning:revised', handler);
      return () => ipcRenderer.removeListener('planning:revised', handler);
    },
    onPlanCompleted: (cb: (sessionId: string, planId: string) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; planId: string }) =>
        cb(payload.sessionId, payload.planId);
      ipcRenderer.on('planning:completed', handler);
      return () => ipcRenderer.removeListener('planning:completed', handler);
    },
    onPlanCancelled: (cb: (sessionId: string, planId: string) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; planId: string }) =>
        cb(payload.sessionId, payload.planId);
      ipcRenderer.on('planning:cancelled', handler);
      return () => ipcRenderer.removeListener('planning:cancelled', handler);
    },
    onPlanError: (cb: (sessionId: string, planId: string, error: string, phaseId?: string) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; planId: string; error: string; phaseId?: string }) =>
        cb(payload.sessionId, payload.planId, payload.error, payload.phaseId);
      ipcRenderer.on('planning:error', handler);
      return () => ipcRenderer.removeListener('planning:error', handler);
    },
    onApprovalRequired: (cb: (sessionId: string, planId: string, phase: Phase) => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; planId: string; phase: Phase }) =>
        cb(payload.sessionId, payload.planId, payload.phase);
      ipcRenderer.on('planning:approval-required', handler);
      return () => ipcRenderer.removeListener('planning:approval-required', handler);
    },
    onPermissionModeChanged: (cb: (sessionId: string, mode: 'plan' | 'auto') => void): (() => void) => {
      const handler = (_e: unknown, payload: { sessionId: string; mode: 'plan' | 'auto' }) =>
        cb(payload.sessionId, payload.mode);
      ipcRenderer.on('permission-mode-changed', handler);
      return () => ipcRenderer.removeListener('permission-mode-changed', handler);
    },
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
    listRemoteModels: (
      args: { baseUrl: string; apiKey?: string },
    ): Promise<{ ids: string[] } | { error: string }> =>
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
    save: (settings: AiSettings): Promise<void> =>
      ipcRenderer.invoke('settings:save', settings),
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
    rewriteMessages: (id: string, messages: StoredMessage[]): Promise<void> =>
      ipcRenderer.invoke('sessions:rewriteMessages', id, messages),
    updateMeta: (
      id: string,
      patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
    ): Promise<SessionMeta> =>
      ipcRenderer.invoke('sessions:updateMeta', id, patch),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('sessions:delete', id),
    branch: (parentId: string, upToMessageId: string): Promise<unknown> =>
      ipcRenderer.invoke('sessions:branch', parentId, upToMessageId),
    revealInFolder: (id: string): Promise<void> =>
      ipcRenderer.invoke('sessions:revealInFolder', id),
    listFiles: (id: string): Promise<unknown[]> =>
      ipcRenderer.invoke('sessions:listFiles', id),
    revealFile: (absPath: string): Promise<void> =>
      ipcRenderer.invoke('sessions:revealFile', absPath),
    saveExport: (
      html: string,
      suggestedName: string,
    ): Promise<string | null> =>
      ipcRenderer.invoke('sessions:saveExport', { html, suggestedName }),
    shareExport: (
      html: string,
      filename: string,
      ttlDays?: number,
    ): Promise<SharedExportResult> =>
      ipcRenderer.invoke('sessions:shareExport', { html, filename, ttlDays }),
    revokeExport: (
      namespace: string,
      id: string,
      ownerToken: string,
    ): Promise<void> =>
      ipcRenderer.invoke('sessions:revokeExport', { namespace, id, ownerToken }),
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
    pickFile: (opts?: { defaultPath?: string; title?: string }): Promise<string | null> =>
      ipcRenderer.invoke('fs:pickFile', opts),
    readFile: (absolutePath: string): Promise<string | null> =>
      ipcRenderer.invoke('fs:readFile', absolutePath),
    readFileBase64: (absolutePath: string): Promise<string | null> =>
      ipcRenderer.invoke('fs:readFileBase64', absolutePath),
  },
  files: {
    search: (args: { root: string; query: string; limit?: number }): Promise<unknown[]> =>
      ipcRenderer.invoke('files:search', args),
    grep: (args: { root: string; query: string; useRegex?: boolean; caseSensitive?: boolean; limit?: number }): Promise<unknown[]> =>
      ipcRenderer.invoke('files:grep', args),
    listDirectory: (args: { path: string; root: string; includeHidden?: boolean }): Promise<unknown[]> =>
      ipcRenderer.invoke('files:listDirectory', args),
    buildFileTree: (args: { path: string; root: string; includeHidden?: boolean; maxDepth?: number }): Promise<unknown[]> =>
      ipcRenderer.invoke('files:buildFileTree', args),
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
  agents: {
    getDir: (): Promise<string> => ipcRenderer.invoke('agents:getDir'),
    getReferenceDocPath: (): Promise<string> =>
      ipcRenderer.invoke('agents:getReferenceDocPath'),
    list: (): Promise<unknown[]> => ipcRenderer.invoke('agents:list'),
    get: (slug: string): Promise<unknown | null> =>
      ipcRenderer.invoke('agents:get', slug),
    listFiles: (dirPath: string): Promise<unknown[]> =>
      ipcRenderer.invoke('agents:listFiles', dirPath),
    delete: (slug: string): Promise<boolean> =>
      ipcRenderer.invoke('agents:delete', slug),
    invalidateCache: (): Promise<void> =>
      ipcRenderer.invoke('agents:invalidateCache'),
    openInEditor: (dirPath: string): Promise<string> =>
      ipcRenderer.invoke('agents:openInEditor', dirPath),
    revealInFinder: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('agents:revealInFinder', dirPath),
    validate: (
      dirPath: string,
      slug: string,
    ): Promise<{ ok: boolean; report: string }> =>
      ipcRenderer.invoke('agents:validate', dirPath, slug),
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
    mcpStatus: (): Promise<
      Array<{
        slug: string;
        ok: boolean;
        reason?: 'disabled' | 'missing-secrets' | 'no-consent' | 'connect-failed';
        toolCount?: number;
        error?: string;
      }>
    > => ipcRenderer.invoke('extensions:mcp.status'),
    /** Runtime MCP connection outcomes, pushed when a session connects its
     *  servers. Fires a refresh hint; callers re-read `mcpStatus()`. */
    onMcpStatus: (cb: () => void): (() => void) => {
      const handler = () => cb();
      ipcRenderer.on('mcp-status', handler);
      return () => ipcRenderer.removeListener('mcp-status', handler);
    },
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
      userContext?: string;
      sessionId?: string;
      cwd?: string;
    }) => ipcRenderer.invoke('git:generateCommitMessage', args),
    mergeState: (repoRoot: string) =>
      ipcRenderer.invoke('git:mergeState', repoRoot),
    conflictContent: (args: {
      repoRoot: string;
      relativePath: string;
      absolutePath: string;
    }) => ipcRenderer.invoke('git:conflictContent', args),
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
    resolveShell: (): Promise<string> =>
      ipcRenderer.invoke('terminal:resolveShell'),

    create: (opts: { cwd: string; shell?: string }): Promise<TerminalTabInfo> =>
      ipcRenderer.invoke('terminal:create', opts),

    write: (tabId: string, data: string): Promise<void> =>
      ipcRenderer.invoke('terminal:write', { tabId, data }),

    resize: (tabId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke('terminal:resize', { tabId, cols, rows }),

    getScrollback: (tabId: string): Promise<string | null> =>
      ipcRenderer.invoke('terminal:getScrollback', tabId),

    listTabs: (): Promise<TerminalTabInfo[]> =>
      ipcRenderer.invoke('terminal:listTabs'),

    kill: (tabId: string): Promise<void> =>
      ipcRenderer.invoke('terminal:kill', tabId),

    listShells: (): Promise<string[]> =>
      ipcRenderer.invoke('terminal:listShells'),

    onData: (cb: (tabId: string, data: string) => void): (() => void) => {
      const h = (_e: unknown, p: { tabId: string; data: string }) => cb(p.tabId, p.data);
      ipcRenderer.on('terminal:data', h);
      return () => ipcRenderer.removeListener('terminal:data', h);
    },

    onExit: (cb: (tabId: string, exitCode: number) => void): (() => void) => {
      const h = (_e: unknown, p: { tabId: string; exitCode: number }) =>
        cb(p.tabId, p.exitCode);
      ipcRenderer.on('terminal:exit', h);
      return () => ipcRenderer.removeListener('terminal:exit', h);
    },

    onTitleChange: (cb: (tabId: string, title: string) => void): (() => void) => {
      const h = (_e: unknown, p: { tabId: string; title: string }) =>
        cb(p.tabId, p.title);
      ipcRenderer.on('terminal:titleChange', h);
      return () => ipcRenderer.removeListener('terminal:titleChange', h);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('env', { homedir: osHomedir() });
