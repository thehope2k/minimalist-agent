// Types for `window.api` exposed by the preload bridge.

export interface ClaudeTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

export type ChatRole = 'user' | 'assistant';

export type ErrorCode =
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

export interface AgentError {
  code: ErrorCode;
  title: string;
  message: string;
  canRetry: boolean;
  retryDelayMs?: number;
  /**
   * Exact ms until the API will accept a retry — only set when extracted
   * from a real `retry-after` value. UI shows a live countdown.
   */
  retryAfterMs?: number;
  originalError?: string;
}

/** Three-mode safety floor (see `src/main/agent/permissions.ts`). */
export type PermissionMode = 'plan' | 'ask' | 'auto';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export interface PermissionRequest {
  reqId: string;
  /** Owning chat turn (assistant message id). */
  turnId: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ChatSendRequest {
  id: string;
  connectionSlug: string;
  model: string;
  prompt: string;
  cwd?: string;
  resumeSessionId?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  sessionId?: string;
  /** Already-stored attachments for this turn. */
  attachments?: StoredAttachment[];
}

/** File classes we know how to handle. Office files are intentionally not supported. */
export type AttachmentType = 'image' | 'pdf' | 'text';

/**
 * Draft attachment — picked / pasted / dropped, not yet persisted.
 * Lives only in renderer state until the user hits Send.
 */
export interface DraftAttachment {
  type: AttachmentType;
  /** Original absolute path, or 'clipboard' for pasted images. */
  path: string;
  name: string;
  mimeType: string;
  size: number;
  /** Set for images / PDFs (raw base64 of original bytes). */
  base64?: string;
  /** Set for text files (entire content if small, truncated if large). */
  text?: string;
}

/**
 * Stored attachment — written to disk, ready to send and persist with the
 * message log.
 */
export interface StoredAttachment {
  type: AttachmentType;
  /** Display name. */
  name: string;
  mimeType: string;
  /** Possibly-resized size in bytes. */
  size: number;
  /** Absolute path where the file lives in the session attachments dir. */
  storedPath: string;
  /** Small (≤200×200 PNG) preview used in chips and inline message renders. */
  thumbnailBase64?: string;
  /** Optimized base64 used for the actual API payload (images only). */
  resizedBase64?: string;
}

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type ChatStreamEvent =
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
      /**
       * Per-API-call usage. Emitted on every SDK `assistant` message in a
       * turn (one per round of tool use). The latest event represents the
       * actual prompt size on the most recent call — used by the context
       * badge for an honest "how full is the context" reading.
       */
      id: string;
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | {
      id: string;
      type: 'compaction';
      trigger: 'manual' | 'auto';
      preTokens: number;
      postTokens?: number;
      durationMs?: number;
    }
  | { id: string; type: 'error'; error: AgentError; sessionId?: string };

export interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
}

export type PiAuthProvider = 'github-copilot';

export interface ConnectionMeta {
  slug: string;
  name: string;
  providerType: 'anthropic' | 'pi';
  authType: 'api_key' | 'oauth';
  /** Required when providerType === 'pi'. */
  piAuthProvider?: PiAuthProvider;
  defaultModel: string;
  models: ModelDef[];
  createdAt: number;
}

export type Credential =
  | { type: 'api_key'; apiKey: string }
  | {
      type: 'oauth';
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      scopes?: string[];
    };

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiSettings {
  defaultModel?: string;
  defaultThinking: ThinkingLevel;
  extendedContext?: boolean;
  recentFolders?: string[];
  maxTurns?: number;
  /** Mode applied to brand-new sessions. Defaults to 'ask' on the main side. */
  defaultPermissionMode?: PermissionMode;
}

export interface UserLocation {
  city?: string;
  region?: string;
  country?: string;
}

export interface UserPreferences {
  name?: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone?: string;
  location?: UserLocation;
  /** ISO 639-1 language code (e.g. 'en', 'ja'). */
  language?: string;
  notes?: string;
  /** Whether to include the Co-Authored-By trailer in commit messages. */
  includeCoAuthoredBy?: boolean;
}

export type StoredMessagePart =
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

export interface StoredMessage {
  id: string;
  role: ChatRole;
  content: string;
  parts?: StoredMessagePart[];
  model?: string;
  /** Legacy: free-form error string. New errors live on `errorInfo`. */
  error?: string;
  /** Structured error written by `useChat` on terminal error events. */
  errorInfo?: AgentError;
  stopReason?: string;
  /** Token counts from the SDK's `result` message for this turn. */
  usage?: AgentUsage;
  /**
   * Origin tag for messages submitted from a non-chat surface (e.g.
   * `'add-skill'` from the New Skill dialog). The renderer uses this to
   * show a small contextual chip above the user bubble.
   */
  intentTag?: string;
  createdAt: number;
  /** User-message attachments (images / PDFs / text files). */
  attachments?: StoredAttachment[];
  /**
   * If set, this isn't a normal user/assistant message but a marker line
   * inserted between turns (e.g. compaction boundary). Renderers branch
   * on this BEFORE role and render as a divider.
   */
  markerKind?: 'compaction';
  /** Populated for `markerKind === 'compaction'`. */
  compactionMeta?: {
    trigger: 'manual' | 'auto';
    preTokens: number;
    postTokens?: number;
    durationMs?: number;
  };
}

export interface SessionUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface SessionMeta {
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

export type SessionSummary = SessionMeta;

export interface Project {
  id: string;
  name: string;
  /** Absolute root path used to auto-assign new sessions whose cwd lives under it. */
  rootPath: string;
  color?: string;
  defaultPermissionMode?: PermissionMode;
  /** Sessions in this project default to this connection slug; falls back to global default if missing. */
  defaultConnectionSlug?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectInput {
  name: string;
  rootPath: string;
  color?: string;
  defaultPermissionMode?: PermissionMode;
  defaultConnectionSlug?: string;
}

export type SessionFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: SessionFileNode[] };

/* ---------- File search (mention picker) ---------- */

export interface FileSearchEntry {
  type: 'file' | 'directory';
  name: string;
  /** Path relative to the search root. Goes into `[file:…]` mentions. */
  relativePath: string;
  absolutePath: string;
  mtimeMs: number;
}

/* ---------- Skills ---------- */

export interface SkillMetadata {
  name: string;
  description: string;
  globs?: string[];
  alwaysAllow?: string[];
  icon?: string;
}

export type SkillSource = 'global';

export interface LoadedSkill {
  slug: string;
  metadata: SkillMetadata;
  /** SKILL.md body (without frontmatter). */
  content: string;
  /** Absolute path of any local icon file, e.g. `<dir>/icon.png`. */
  iconPath?: string;
  /** Absolute path of the skill directory. */
  path: string;
  /** Tier the skill was loaded from. Single tier today. */
  source: SkillSource;
}

export type SkillFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: SkillFileNode[] };

/* ---------- Extensions ---------- */

export interface ExtensionGuideFrontmatter {
  name?: string;
  description?: string;
  icon?: string;
}

export interface SecretRef {
  secret: string;
}

export type EnvValue = string | SecretRef;

export type McpConfig =
  | {
      transport: 'stdio';
      command: string;
      args?: string[];
      envFromBinding?: boolean;
    }
  | {
      transport: 'http' | 'sse';
      url: string;
      headers?: Record<string, string>;
    };

export interface ExtensionPermissions {
  tools?: string[];
  writeAccess?: boolean;
  networkHosts?: string[];
  commandPrefixes?: string[];
}

export interface ExtensionProvenance {
  createdBy: 'agent' | 'user';
  createdAt?: string;
  sources?: Array<{ url: string; fetchedAt: string; note?: string }>;
}

export interface ExtensionConfig {
  schemaVersion: 1;
  slug: string;
  name: string;
  description: string;
  enabled?: boolean;
  version?: string;
  icon?: string;
  tags?: string[];
  env?: Record<string, EnvValue>;
  mcp?: McpConfig;
  permissions?: ExtensionPermissions;
  provenance?: ExtensionProvenance;
}

export type ExtensionVariant = 'guide-only' | 'cli-bound' | 'mcp-backed';
export type ExtensionScope = 'global';

export interface LoadedExtension {
  slug: string;
  scope: ExtensionScope;
  path: string;
  config: ExtensionConfig;
  guideFrontmatter: ExtensionGuideFrontmatter;
  guideBody: string;
  iconPath?: string;
  variant: ExtensionVariant;
  guidePath: string;
}

export type ExtensionFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: ExtensionFileNode[] };

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdateInfo {
  state: UpdateState;
  currentVersion: string;
  latestVersion: string | null;
  progress: number;
  error?: string;
}

export interface AppApi {
  update: {
    getInfo: () => Promise<UpdateInfo>;
    check: () => Promise<UpdateInfo>;
    download: () => Promise<UpdateInfo>;
    install: () => Promise<void>;
    onInfo: (cb: (info: UpdateInfo) => void) => () => void;
  };
  app: {
    getVersion: () => Promise<string>;
    getKeepAwake: () => Promise<boolean>;
    setKeepAwake: (enabled: boolean) => Promise<boolean>;
    setAgentActive: (active: boolean) => Promise<void>;
    notify: (title: string, body?: string) => Promise<boolean>;
  };
  claudeOAuth: {
    start: () => Promise<{ ok: true; url: string }>;
    cancel: () => Promise<void>;
    exchange: (code: string) => Promise<ClaudeTokens>;
  };
  copilotOAuth: {
    /**
     * Start the device flow. Resolves once the user has authorized on
     * github.com and the Pi SDK has exchanged tokens.
     */
    start: () => Promise<{
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
    }>;
    cancel: () => Promise<void>;
    /** Subscribe to the device-code event so the UI can render it. */
    onDeviceCode: (
      cb: (u: { userCode: string; verificationUri: string }) => void,
    ) => () => void;
  };
  copilot: {
    /**
     * Fetch the live, tier-filtered Copilot model list. Pass either a
     * fresh `refreshToken` (during setup, before save) or a
     * `connectionSlug` (after save).
     */
    fetchModels: (
      args: { refreshToken?: string; connectionSlug?: string },
    ) => Promise<{ models: ModelDef[] } | { error: string }>;
  };
  chat: {
    send: (req: ChatSendRequest) => Promise<void>;
    abort: (id: string) => Promise<void>;
    /** Inject a user message into an in-flight turn. */
    steer: (
      turnId: string,
      message: string,
    ) => Promise<{ ok: boolean; reason?: string }>;
    onEvent: (cb: (event: ChatStreamEvent) => void) => () => void;
    onPermissionRequest: (
      cb: (req: PermissionRequest) => void,
    ) => () => void;
    respondPermission: (
      reqId: string,
      decision: PermissionDecision,
    ) => Promise<void>;
    generateTitle: (args: {
      connectionSlug: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      model?: string;
      sessionId?: string;
      cwd?: string;
    }) => Promise<string | null>;
  };
  connections: {
    list: () => Promise<ConnectionMeta[]>;
    getDefaultSlug: () => Promise<string | undefined>;
    setDefaultSlug: (slug: string | null) => Promise<void>;
    save: (meta: ConnectionMeta, credential: Credential) => Promise<void>;
    delete: (slug: string) => Promise<void>;
    getCredential: (slug: string) => Promise<Credential | null>;
    isEncryptionAvailable: () => Promise<boolean>;
    test: (slug: string) => Promise<{ ok: true } | { ok: false; error: AgentError }>;
  };
  settings: {
    get: () => Promise<AiSettings>;
    save: (settings: AiSettings) => Promise<void>;
    pushRecentFolder: (folder: string) => Promise<AiSettings>;
    removeRecentFolder: (folder: string) => Promise<AiSettings>;
  };
  preferences: {
    get: () => Promise<UserPreferences>;
    save: (prefs: UserPreferences) => Promise<void>;
  };
  sessions: {
    list: () => Promise<SessionSummary[]>;
    load: (
      id: string,
    ) => Promise<{ meta: SessionMeta; messages: StoredMessage[] } | null>;
    create: (opts?: {
      workingDirectory?: string;
      projectId?: string | null;
    }) => Promise<SessionMeta>;
    setProject: (id: string, projectId: string | null) => Promise<SessionMeta>;
    appendMessage: (id: string, msg: StoredMessage) => Promise<void>;
    replaceLastMessage: (id: string, msg: StoredMessage) => Promise<void>;
    updateMeta: (
      id: string,
      patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
    ) => Promise<SessionMeta>;
    truncateFrom: (id: string, firstDroppedId: string) => Promise<number>;
    delete: (id: string) => Promise<void>;
    revealInFolder: (id: string) => Promise<void>;
    listFiles: (id: string) => Promise<SessionFileNode[]>;
    revealFile: (absPath: string) => Promise<void>;
  };
  projects: {
    list: () => Promise<Project[]>;
    create: (input: ProjectInput) => Promise<Project>;
    update: (
      id: string,
      patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
    ) => Promise<Project | null>;
    delete: (
      id: string,
    ) => Promise<{ ok: boolean; sessionsCleared: number }>;
  };
  fs: {
    pickDirectory: () => Promise<string | null>;
  };
  files: {
    /** BFS file/folder search rooted at `root`, respecting `.gitignore`. */
    search: (args: {
      root: string;
      query: string;
      limit?: number;
    }) => Promise<FileSearchEntry[]>;
  };
  skills: {
    /** Absolute path of the on-disk skills directory (under userData). */
    getDir: () => Promise<string>;
    /** Path of the bundled skill-format reference doc (markdown). */
    getReferenceDocPath: () => Promise<string>;
    /** All installed skills. */
    list: () => Promise<LoadedSkill[]>;
    /** O(1) lookup by slug. */
    get: (slug: string) => Promise<LoadedSkill | null>;
    /** Recursive directory listing for the skill info page file tree. */
    listFiles: (dirPath: string) => Promise<SkillFileNode[]>;
    /** Delete the skill directory. */
    delete: (slug: string) => Promise<boolean>;
    /** Drop the loader cache (call after edits in an external editor). */
    invalidateCache: () => Promise<void>;
    /** OS-default open (e.g. VS Code if associated). */
    openInEditor: (dirPath: string) => Promise<string>;
    /** Reveal the directory in Finder/Explorer. */
    revealInFinder: (dirPath: string) => Promise<void>;
    /** Validate SKILL.md schema + body. Returns formatted text report. */
    validate: (
      dirPath: string,
      slug: string,
    ) => Promise<{ ok: boolean; report: string }>;
  };
  extensions: {
    getDir: () => Promise<string>;
    getReferenceDocPath: () => Promise<string>;
    list: () => Promise<LoadedExtension[]>;
    get: (slug: string) => Promise<LoadedExtension | null>;
    listFiles: (dirPath: string) => Promise<ExtensionFileNode[]>;
    delete: (slug: string) => Promise<boolean>;
    setEnabled: (slug: string, enabled: boolean) => Promise<boolean | null>;
    invalidateCache: () => Promise<void>;
    openInEditor: (dirPath: string) => Promise<string>;
    revealInFinder: (dirPath: string) => Promise<void>;
    validate: (
      dirPath: string,
      slug: string,
    ) => Promise<{ ok: boolean; report: string }>;

    secretsEncryptionAvailable: () => Promise<boolean>;
    listSecretKeys: (slug: string) => Promise<string[]>;
    setSecret: (slug: string, keyName: string, value: string) => Promise<void>;
    deleteSecret: (slug: string, keyName: string) => Promise<void>;
    declaredSecrets: (slug: string) => Promise<string[]>;
    missingSecrets: (slug: string) => Promise<string[]>;

    hasConsent: (slug: string) => Promise<boolean>;
    grantConsent: (slug: string) => Promise<boolean>;
    revokeConsent: (slug: string) => Promise<boolean>;

    mcpStatus: () => Promise<
      Array<{ slug: string; ok: boolean; reason?: string }>
    >;
  };
  attachments: {
    /**
     * Open the system file picker (multi-select) and return draft
     * attachments for everything the user picked.
     */
    pickFiles: () => Promise<DraftAttachment[]>;
    /** Read a single absolute path (drag-drop / pasted file URI) into a draft. */
    readPath: (path: string) => Promise<DraftAttachment | null>;
    /** Persist a draft into the session's attachments dir. */
    store: (sessionId: string, draft: DraftAttachment) => Promise<StoredAttachment>;
    /** Read a stored attachment back as base64 (for re-rendering on reload). */
    readAsBase64: (storedPath: string) => Promise<string | null>;
    /** Reveal in OS file manager. */
    reveal: (storedPath: string) => Promise<void>;
  };
}

/** Synchronous environment values exposed by the preload bridge. */
export interface AppEnv {
  /** Absolute path of the user's home directory. */
  homedir: string;
}

declare global {
  interface Window {
    api: AppApi;
    env: AppEnv;
  }
}

export {};
