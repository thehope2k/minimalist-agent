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
export type AttachmentType = 'image' | 'pdf' | 'text' | 'snippet';

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
  /** Detected or user-set language tag (snippets only). */
  language?: string;
  /** Pre-computed line count (snippets only). */
  lineCount?: number;
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
  /** Detected or user-set language tag (snippets only). */
  language?: string;
  /** Pre-computed line count (snippets only). */
  lineCount?: number;
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

export interface CopilotQuota {
  /** Percentage of premium requests *remaining* this month (0–100). */
  percentRemaining: number;
  /** Monthly allowance (entitlement). Null if unlimited. */
  entitlement: number | null;
  /** Requests used this month (derived). Null if unlimited. */
  used: number | null;
  /** Requests billed as overage this month. */
  overageCount: number;
  /** Whether the plan allows overage usage beyond the allowance. */
  overagePermitted: boolean;
  /** Whether this plan has unlimited premium requests. */
  unlimited: boolean;
  /** ISO date string — 1st of the next month at 00:00 UTC. */
  resetDate: string;
  /** Normalised plan identifier: 'free' | 'individual' | 'business' | 'enterprise'. */
  planType: string | null;
  /** True when premium_interactions was unavailable and chat was used instead. */
  fallback: boolean;
}

export interface ClaudeUsageEntry {
  rateLimitType: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage';
  utilization: number;
  resetsAt?: number;
  status: 'allowed' | 'allowed_warning' | 'rejected';
}

export interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
}


export type { PiAuthProvider } from '../../../shared/pi-types';

export interface ConnectionMeta {
  slug: string;
  name: string;
  providerType: 'anthropic' | 'pi' | 'local';
  authType: 'api_key' | 'oauth';
  /** Required when providerType === 'pi'. */
  piAuthProvider?: PiAuthProvider;
  /** Base URL for local model server (providerType === 'local'). */
  baseUrl?: string;
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
  /** Mode applied to brand-new chats; switch per-session above the composer. */
  defaultPermissionMode?: PermissionMode;
  /**
   * Filenames (case-insensitive) scanned as project context files each turn.
   * Defaults to ['agents.md', 'claude.md', 'copilot-instructions.md'].
   */
  contextFileNames?: string[];
  /** Directory levels deep to scan for .specify/ entities. Default 3. */
  sddScanDepth?: number;
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
  /** Total wall-clock duration of the turn in milliseconds. */
  durationMs?: number;
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
  sddMode?: 'auto' | 'off';
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
  /** Override the global Co-Authored-By trailer preference. Undefined means inherit global. */
  includeCoAuthoredBy?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectInput {
  name: string;
  rootPath: string;
  color?: string;
  defaultPermissionMode?: PermissionMode;
  defaultConnectionSlug?: string;
  includeCoAuthoredBy?: boolean;
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

/* ---------- Content grep (Search Everywhere) ---------- */

export interface ContentMatchEntry {
  relativePath: string;
  absolutePath: string;
  /** 1-based line number of the match. */
  lineNumber: number;
  /** Full source line with trailing newline stripped. */
  lineContent: string;
  /** Character offset of match start within `lineContent`. */
  matchStart: number;
  /** Character offset of match end (exclusive) within `lineContent`. */
  matchEnd: number;
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

/* ---------- Git diff review ---------- */

export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | '?';

export interface GitFileEntry {
  absolutePath: string;
  relativePath: string;
  status: GitFileStatus;
  repoRoot: string;
}

export interface GitRepo {
  root: string;
  files: GitFileEntry[];
}

export interface GitStatusResult {
  repos: GitRepo[];
  error?: string;
}

export interface GitFileDiff {
  original: string;
  modified: string;
  language: string;
}

export interface TerminalTabInfo {
  tabId: string;
  title: string;
  cwd: string;
  shell: string;
  pid: number;
  alive: boolean;
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
    openExternal: (url: string) => Promise<void>;
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
  chatgptOAuth: {
    /**
     * Start the PKCE browser-redirect flow.
     */
    start: () => Promise<{
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
    }>;
    cancel: () => Promise<void>;
    onBrowserOpen: (cb: (url: string) => void) => () => void;
  };
  chatgpt: {
    /** Pi SDK static model registry for openai-codex — no network call. */
    getModels: () => Promise<ModelDef[]>;
  };
  claude: {
    /** Fetch OAuth usage buckets from api.anthropic.com for a Claude OAuth connection. */
    fetchUsage: (
      args: { connectionSlug: string },
    ) => Promise<ClaudeUsageEntry[] | { error: string }>;
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
    /**
     * Fetch the current-month premium-request quota snapshot.
     * Uses the stored GitHub OAuth token — not the Copilot API token.
     * Returns { error } when the token lacks billing permissions.
     */
    fetchQuota: (
      args: { connectionSlug: string },
    ) => Promise<CopilotQuota | { error: string }>;

  };
  chat: {
    send: (req: ChatSendRequest) => Promise<void>;
    abort: (id: string) => Promise<void>;
    /** Inject a user message into an in-flight turn. */
    steer: (
      turnId: string,
      message: string,
      attachments?: StoredAttachment[],
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
    branch: (parentId: string, upToMessageId: string) => Promise<SessionMeta | null>;
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
    pickFile: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>;
    /** Read a file's text content. Returns null if file is missing, binary, or >2 MB. */
    readFile: (absolutePath: string) => Promise<string | null>;
    /** Read a file as base64. Returns null if missing or >20 MB. Used for image previews. */
    readFileBase64: (absolutePath: string) => Promise<string | null>;
  };
  files: {
    /** BFS file/folder search rooted at `root`, respecting `.gitignore`. */
    search: (args: {
      root: string;
      query: string;
      limit?: number;
    }) => Promise<FileSearchEntry[]>;
    /** Full-text / regex content search rooted at `root`, respecting `.gitignore`. */
    grep: (args: {
      root: string;
      query: string;
      useRegex?: boolean;
      caseSensitive?: boolean;
      limit?: number;
    }) => Promise<ContentMatchEntry[]>;
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
  sdd: {
    initSessionState: (
      sessionId: string,
      cwd: string,
      mode: 'auto' | 'off',
    ) => Promise<import('./sdd').SddSessionState>;
    getSessionState: (sessionId: string) => Promise<import('./sdd').SddSessionState | null>;
    setMapping: (
      sessionId: string,
      patch: import('./sdd').SddMappingPatch,
    ) => Promise<import('./sdd').SddSessionState | null>;
    setMode: (
      sessionId: string,
      mode: 'auto' | 'off',
    ) => Promise<import('./sdd').SddSessionState | null>;
    setActiveFeature: (
      sessionId: string,
      slug: string | null,
    ) => Promise<import('./sdd').SddSessionState | null>;
    readArtifact: (absolutePath: string) => Promise<string>;
    toggleTaskCheckbox: (absolutePath: string, checkboxIndex: number) => Promise<void>;
    runInit: (targetDir: string) => Promise<{ success: boolean; error?: string; installCmd?: string }>;
    cleanupSession: (sessionId: string) => Promise<void>;
    /** Returns an unsubscribe function. */
    onArtifactChanged: (cb: (sessionId: string) => void) => () => void;
    /** Returns an unsubscribe function. Fired when CWD changes for a session. */
    onStateChanged: (cb: (sessionId: string) => void) => () => void;
  };
  git: {
    /**
     * Discover all git repos under `cwd` and return their changed files
     * (`git status --porcelain`). Supports multi-repo workspaces.
     */
    status: (cwd: string) => Promise<GitStatusResult>;
    /** Get the two text strings (original vs modified) for Monaco DiffEditor. */
    diff: (args: {
      repoRoot: string;
      relativePath: string;
      absolutePath: string;
      status: string;
    }) => Promise<GitFileDiff>;
    /** Stage specific files (with optional line-level custom content) and commit. */
    commitFiles: (args: {
      repoRoot: string;
      files: Array<{ relativePath: string; absolutePath: string; status: string; content?: string }>;
      message: string;
      amend?: boolean;
    }) => Promise<{ ok: boolean; error?: string }>;
    lastCommitMessage: (repoRoot: string) => Promise<string | null>;
    branchName: (repoRoot: string) => Promise<string | null>;
    lastCommitFiles: (repoRoot: string) => Promise<string | null>;
    lastCommitDiff: (repoRoot: string) => Promise<string | null>;
    generateCommitMessage: (args: {
      connectionSlug: string;
      model?: string;
      diffContext: string;
      sessionId?: string;
      cwd?: string;
    }) => Promise<string | null>;
  };
  terminal: {
    resolveShell: () => Promise<string>;
    create: (opts: { cwd: string; shell?: string }) => Promise<TerminalTabInfo>;
    write: (tabId: string, data: string) => Promise<void>;
    resize: (tabId: string, cols: number, rows: number) => Promise<void>;
    getScrollback: (tabId: string) => Promise<string | null>;
    listTabs: () => Promise<TerminalTabInfo[]>;
    kill: (tabId: string) => Promise<void>;
    listShells: () => Promise<string[]>;
    /** Returns an unsubscribe function. */
    onData: (cb: (tabId: string, data: string) => void) => () => void;
    /** Returns an unsubscribe function. */
    onExit: (cb: (tabId: string, exitCode: number) => void) => () => void;
    /** Returns an unsubscribe function. */
    onTitleChange: (cb: (tabId: string, title: string) => void) => () => void;
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
