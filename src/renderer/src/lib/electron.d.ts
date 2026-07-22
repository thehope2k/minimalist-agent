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

/** Two-mode execution control (see `src/main/agent/permissions.ts`). */
export type PermissionMode = 'plan' | 'auto';

/** Collaboration engagement types for intelligent agent autonomy. */
import type {
  EngagementType,
  EngagementRequest,
  EngagementResponse,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
  NamedOption,
  TradeOffAnalysis,
  Alternative,
  TradeOff,
} from '../../../shared/collaboration-types';

import type {
  Plan,
  Phase,
  PlanStatus,
  PhaseStatus,
  PlanRevision,
  CreatePlanInput,
  CreatePlanOutput,
  ReportPhaseProgressInput,
  ReportPhaseProgressOutput,
  RevisePlanInput,
  RevisePlanOutput,
} from '../../../shared/planning-types';

export type {
  EngagementType,
  EngagementRequest,
  EngagementResponse,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
  NamedOption,
  TradeOffAnalysis,
  Alternative,
  TradeOff,
};

export type {
  Plan,
  Phase,
  PlanStatus,
  PhaseStatus,
  PlanRevision,
  CreatePlanInput,
  CreatePlanOutput,
  ReportPhaseProgressInput,
  ReportPhaseProgressOutput,
  RevisePlanInput,
  RevisePlanOutput,
};

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

export type NestedChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'text_complete'; text: string }
  | { type: 'thinking_delta'; text: string }
  | {
      type: 'tool_start';
      toolUseId: string;
      name: string;
      input?: unknown;
    }
  | { type: 'tool_input_delta'; toolUseId: string; partialJson: string }
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

export interface SubagentProgressUpdate {
  kind: 'subagent';
  execId: string;
  agentSlug: string;
  agentName?: string;
  phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error';
  detail?: string;
  event?: NestedChatStreamEvent;
  at?: number;
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
  | ({ id: string; type: 'compaction' } & CompactionMeta)
  | {
      id: string;
      type: 'compaction_progress';
      phase: 'started' | 'retrying';
      trigger?: 'manual' | 'threshold' | 'overflow';
    }
  | { id: string; type: 'error'; error: AgentError; sessionId?: string };

export interface CopilotQuota {
  /** Percentage of usage allowance *remaining* this month (0–100). */
  percentRemaining: number;
  /** Monthly allowance. Dollar amount for AI Credits, count for legacy. Null if unlimited. */
  entitlement: number | null;
  /** Usage this month. Dollar amount for AI Credits, count for legacy. Null if unlimited. */
  used: number | null;
  /** Overage amount (dollars for AI Credits, count for legacy). */
  overageCount: number;
  /** Whether the plan allows overage usage beyond the allowance. */
  overagePermitted: boolean;
  /** Whether this plan has unlimited usage. */
  unlimited: boolean;
  /** ISO date string — 1st of the next month at 00:00 UTC. */
  resetDate: string;
  /** Normalised plan identifier: 'free' | 'individual' | 'business' | 'enterprise'. */
  planType: string | null;
  /** True when using a fallback parsing strategy (e.g., chat snapshot instead of ai_credits). */
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
  supportsVision?: boolean;
  supportsToolCalls?: boolean;
  supportsStreaming?: boolean;
  /** Model supports extended thinking / reasoning effort controls. */
  supportsReasoning?: boolean;
  /** Max output tokens (used for custom OpenAI-compatible endpoints). */
  maxOutputTokens?: number;
  category?: 'powerful' | 'versatile' | 'lightweight';
  recommendedFor?: string[];
}


export type { PiAuthProvider } from '../../../shared/pi-types';

export interface ConnectionMeta {
  slug: string;
  name: string;
  providerType: 'anthropic' | 'pi' | 'local' | 'openai-compatible';
  authType: 'api_key' | 'oauth';
  /** Required when providerType === 'pi'. */
  piAuthProvider?: PiAuthProvider;
  /** Base URL for local model server / custom OpenAI-compatible endpoint. */
  baseUrl?: string;
  /** Preset id for 'openai-compatible' connections (e.g. 'stepfun'); 'custom' for hand-entered. */
  presetId?: string;
  defaultModel: string;
  models: ModelDef[];
  /** Epoch ms of the last successful live model fetch (stale-while-revalidate cache). */
  modelsFetchedAt?: number;
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
  /** Default autonomy level (0-100) for new sessions in auto mode. Default 50. */
  defaultAutonomyLevel?: number;
  /**
   * Filenames (case-insensitive) scanned as project context files each turn.
   * Defaults to ['agents.md', 'claude.md', 'copilot-instructions.md'].
   */
  contextFileNames?: string[];
  /** Days after which archived sessions are auto-deleted. `null` disables. */
  sessionRetentionDays?: number | null;
  compactionSettings?: {
    enabled?: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
    summarizerModel?: string;
  };
}

export type OtelExporterType = 'file' | 'otlp' | 'console';

export interface TelemetrySettings {
  /** Master switch for OpenTelemetry tracing. Off by default. */
  enabled: boolean;
  /** Attach prompt/response/tool-argument text to spans. Off by default. */
  captureContent: boolean;
  /** Where finished spans go. */
  exporter: OtelExporterType;
  /** Override path for the `file` exporter. Empty → default traces.jsonl. */
  outfile: string;
  /** OTLP/HTTP endpoint, used only when exporter === 'otlp'. */
  otlpEndpoint: string;
  /** Display name for shared dashboards, e.g. `alice` (→ `user.name`). */
  userName: string;
  /** Team/cohort id (→ `team.id`). */
  teamId: string;
  /** Advanced: extra `OTEL_RESOURCE_ATTRIBUTES`-style `k=v,k=v` attributes. */
  resourceAttributes: string;
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

export interface StoredSubagentTranscript {
  execId: string;
  agentSlug: string;
  agentName?: string;
  phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error';
  detail?: string;
  startedAt: number;
  updatedAt: number;
  parts: StoredMessagePart[];
  isStreaming: boolean;
  stopReason?: string;
  usage?: AgentUsage;
  latestCallUsage?: AgentUsage;
  error?: string;
  errorInfo?: AgentError;
}

export type StoredMessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string; collapsed?: boolean }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input?: unknown;
      partialInputJson?: string;
      result?: { content: string; isError?: boolean };
      status: 'running' | 'done' | 'error';
      subagent?: StoredSubagentTranscript;
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
   * Per-call usage from the latest API round inside the turn. Distinct from
   * `usage` (the turn's aggregate across all rounds), which can exceed the
   * context window on tool-heavy turns. Consumers that need "how full is
   * context right now" should prefer this field over `usage`.
   */
  latestCallUsage?: AgentUsage;
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
  compactionMeta?: CompactionMeta;
}

export interface CompactionMeta {
  status?: 'success' | 'failed';
  trigger: 'manual' | 'auto' | 'threshold' | 'overflow';
  preTokens?: number;
  postTokens?: number;
  durationMs?: number;
  summary?: string;
  readFiles?: string[];
  modifiedFiles?: string[];
  errorMessage?: string;
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
  /** Per-session autonomy level (0-100) for intelligent collaboration. Default 50. */
  autonomyLevel?: number;
  projectId?: string | null;
  connectionSlug?: string;
  model?: string;
  /** File explorer state (expanded folder paths). */
  fileExplorer?: {
    expandedPaths: string[];
  };
  /**
   * Scoped asset slugs pinned to this session.
   * Format: 'user:<slug>' | 'project:<slug>'
   */
  pinnedAssets?: string[];
  /** Per-session thinking-level override. Falls back to AiSettings.defaultThinking. */
  thinkingLevel?: ThinkingLevel;
}

export type SessionSummary = SessionMeta;

export interface SharedExportResult {
  /** Public short URL (anyone with the link can read it). */
  url: string;
  namespace: string;
  id: string;
  /** Secret token needed to revoke the link before it expires. */
  ownerToken: string;
  /** ISO timestamp when the host auto-deletes the page. */
  expiresAt: string;
  ttlDays: number;
}

export interface Project {
  id: string;
  name: string;
  /** Absolute root path used to auto-assign new sessions whose cwd lives under it. */
  rootPath: string;
  color?: string;
  defaultPermissionMode?: PermissionMode;
  /** Sessions in this project default to this connection slug; falls back to global default if missing. */
  defaultConnectionSlug?: string;
  /** Override of the global default autonomy level (0-100). */
  defaultAutonomyLevel?: number;
  /** Override of the global default model. */
  defaultModel?: string;
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
  defaultAutonomyLevel?: number;
  defaultModel?: string;
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

/* ---------- File tree (file explorer panel) ---------- */

export interface FileTreeNode {
  type: 'file' | 'directory';
  name: string;
  /** Path relative to the root directory */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** File size in bytes (files only) */
  size?: number;
  /** Last modified timestamp (for sorting) */
  mtimeMs: number;
  /** Children array for directories, null for files */
  children: FileTreeNode[] | null;
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

export type SkillSource = 'user' | 'project';

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

/* ---------- Agents ---------- */

export interface AgentMetadata {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  maxTurns?: number;
  permissionMode?: 'plan' | 'auto';
  effort?: 'low' | 'medium' | 'high';
  icon?: string;
}

export interface LoadedAgent {
  slug: string;
  metadata: AgentMetadata;
  content: string;
  iconPath?: string;
  path: string;
  /** Tier the agent was loaded from. */
  source: 'user' | 'project';
}

export type AgentFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: AgentFileNode[] };

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
  version?: string;
  icon?: string;
  tags?: string[];
  env?: Record<string, EnvValue>;
  mcp?: McpConfig;
  permissions?: ExtensionPermissions;
  provenance?: ExtensionProvenance;
}

export type ExtensionVariant = 'guide-only' | 'cli-bound' | 'mcp-backed';
export type ExtensionScope = 'user' | 'project';

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

export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | '?' | 'U';
export type MergeOperationType = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'none';

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

export interface MergeState {
  type: MergeOperationType;
  headLabel: string | null;
  incomingLabel: string | null;
  mergeMessage: string | null;
  conflictCount: number;
  rebaseProgress?: {
    current: number;
    total: number;
    commitMessage: string | null;
  };
}

export interface ConflictContent {
  base: string;
  ours: string;
  theirs: string;
  working: string;
  language: string;
}

export interface GitOperationResult {
  ok: boolean;
  error?: string;
  allResolved?: boolean;
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
  logs: {
    /** Forward a renderer log line to the on-disk main log (fire-and-forget). */
    write: (record: { level: string; scope: string; parts: string[] }) => void;
    /** Reveal the active log file in the OS file manager. */
    reveal: () => Promise<void>;
    /** Read the tail of the log file (current + previous rotation) as text. */
    read: () => Promise<string>;
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
    /** Manually triggers compaction outside a turn. Pi backend only. */
    manualCompact: (args: {
      turnId: string;
      sessionId: string;
      connectionSlug: string;
      customInstructions?: string;
    }) => Promise<void>;
    onEvent: (cb: (event: ChatStreamEvent) => void) => () => void;
    onCollaborationRequest: (
      cb: (req: EngagementRequest) => void,
    ) => () => void;
    respondCollaboration: (response: EngagementResponse) => Promise<void>;
    generateTitle: (args: {
      connectionSlug: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      model?: string;
      sessionId?: string;
      cwd?: string;
    }) => Promise<string | null>;
  };
  planning: {
    getActivePlan: (sessionId: string) => Promise<Plan | null>;
    cancelPlan: (sessionId: string) => Promise<void>;
    approvePhase: (sessionId: string, phaseId: string, notes?: string) => Promise<void>;
    denyPhase: (sessionId: string, phaseId: string, reason?: string) => Promise<void>;
    retryPhase: (sessionId: string, phaseId: string) => Promise<void>;
    skipPhase: (sessionId: string, phaseId: string) => Promise<void>;
    onPlanCreated: (cb: (sessionId: string, plan: Plan) => void) => () => void;
    onPlanUpdated: (cb: (sessionId: string, plan: Plan) => void) => () => void;
    onPhaseUpdated: (cb: (sessionId: string, planId: string, phase: Phase) => void) => () => void;
    onPlanRevised: (cb: (sessionId: string, plan: Plan, revision: PlanRevision) => void) => () => void;
    onPlanCompleted: (cb: (sessionId: string, planId: string) => void) => () => void;
    onPlanCancelled: (cb: (sessionId: string, planId: string) => void) => () => void;
    onPlanError: (cb: (sessionId: string, planId: string, error: string, phaseId?: string) => void) => () => void;
    onApprovalRequired: (cb: (sessionId: string, planId: string, phase: Phase) => void) => () => void;
    onPermissionModeChanged: (cb: (sessionId: string, mode: PermissionMode) => void) => () => void;
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
    listRemoteModels: (
      args: { baseUrl: string; apiKey?: string },
    ) => Promise<{ ids: string[] } | { error: string }>;
    /** Force-refresh a connection's model catalog. */
    refreshModels: (
      slug: string,
    ) => Promise<
      | { ok: true; changed: boolean; models: ModelDef[]; fetchedAt: number }
      | { ok: false; reason: 'unsupported' | 'error'; error?: string }
    >;
    /** Subscribe to background/manual model-cache updates. */
    onChanged: (cb: () => void) => () => void;
  };
  settings: {
    get: () => Promise<AiSettings>;
    save: (settings: AiSettings) => Promise<void>;
    pushRecentFolder: (folder: string) => Promise<AiSettings>;
    removeRecentFolder: (folder: string) => Promise<AiSettings>;
  };
  telemetry: {
    get: () => Promise<TelemetrySettings>;
    save: (settings: TelemetrySettings) => Promise<void>;
    tracesPath: () => Promise<string>;
    reveal: () => Promise<void>;
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
    rewriteMessages: (id: string, messages: StoredMessage[]) => Promise<void>;
    updateMeta: (
      id: string,
      patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
    ) => Promise<SessionMeta>;
    truncateFrom: (id: string, firstDroppedId: string) => Promise<number>;
    delete: (id: string) => Promise<void>;
    branch: (
      parentId: string,
      upToMessageId: string,
      options?: { withContext?: boolean },
    ) => Promise<SessionMeta | null>;
    revealInFolder: (id: string) => Promise<void>;
    listFiles: (id: string) => Promise<SessionFileNode[]>;
    revealFile: (absPath: string) => Promise<void>;
    saveExport: (html: string, suggestedName: string) => Promise<string | null>;
    shareExport: (
      html: string,
      filename: string,
      ttlDays?: number,
      backend?: 'brewpage' | 'meethtml',
    ) => Promise<SharedExportResult>;
    revokeExport: (
      namespace: string,
      id: string,
      ownerToken: string,
    ) => Promise<void>;
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
    /** List immediate children of a directory (non-recursive) with gitignore filtering. */
    listDirectory: (args: {
      path: string;
      root: string;
      includeHidden?: boolean;
    }) => Promise<FileTreeNode[]>;
    /** Recursively build a full file tree (for initial load, use with caution on large directories). */
    buildFileTree: (args: {
      path: string;
      root: string;
      includeHidden?: boolean;
      maxDepth?: number;
    }) => Promise<FileTreeNode[]>;
  };
  skills: {
    /** Absolute path of the on-disk skills directory (under userData). */
    getDir: () => Promise<string>;
    /** Project-tier skills directory: <cwd>/.minimalist-agent/skills/ */
    getProjectDir: (cwd: string) => Promise<string>;
    /** Path of the bundled skill-format reference doc (markdown). */
    getReferenceDocPath: () => Promise<string>;
    /** All installed skills. */
    list: () => Promise<LoadedSkill[]>;
    /** O(1) lookup by slug. */
    get: (slug: string) => Promise<LoadedSkill | null>;
    /** Recursive directory listing for the skill info page file tree. */
    listFiles: (dirPath: string) => Promise<SkillFileNode[]>;
    /** Delete the skill directory (absolute path). */
    delete: (dirPath: string) => Promise<boolean>;
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
  agents: {
    getDir: () => Promise<string>;
    /** Project-tier agents directory: <cwd>/.minimalist-agent/agents/ */
    getProjectDir: (cwd: string) => Promise<string>;
    list: () => Promise<LoadedAgent[]>;
    get: (slug: string) => Promise<LoadedAgent | null>;
    listFiles: (dirPath: string) => Promise<AgentFileNode[]>;
    delete: (slug: string) => Promise<boolean>;
    invalidateCache: () => Promise<void>;
    openInEditor: (dirPath: string) => Promise<string>;
    revealInFinder: (dirPath: string) => Promise<void>;
    validate: (
      dirPath: string,
      slug: string,
    ) => Promise<{ ok: boolean; report: string }>;
  };
  context: {
    /** List all available skills + agents + extensions merged from project + user tiers. */
    listAvailable: (cwd?: string, invalidate?: boolean) => Promise<{ skills: LoadedSkill[]; agents: LoadedAgent[]; extensions: LoadedExtension[] }>;
    /** Pin a scoped asset to a session. scopedSlug: 'user:<slug>' | 'project:<slug>' */
    pin: (sessionId: string, scopedSlug: string) => Promise<unknown>;
    /** Unpin a scoped asset from a session. */
    unpin: (sessionId: string, scopedSlug: string) => Promise<unknown>;
    /** Estimate total token cost for an array of pinned asset slugs. */
    estimateTokens: (pinnedAssets: string[], cwd?: string) => Promise<number>;
    /** Check whether a CWD has project-local .minimalist-agent/ assets. */
    hasProjectAssets: (cwd: string) => Promise<boolean>;
  };
  extensions: {
    getDir: () => Promise<string>;
    /** Project-tier extensions directory: <cwd>/.minimalist-agent/extensions/ */
    getProjectDir: (cwd: string) => Promise<string>;
    getReferenceDocPath: () => Promise<string>;
    list: (cwd?: string) => Promise<LoadedExtension[]>;
    get: (slug: string) => Promise<LoadedExtension | null>;
    listFiles: (dirPath: string) => Promise<ExtensionFileNode[]>;
    delete: (dirPath: string) => Promise<boolean>;
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
      Array<{
        slug: string;
        ok: boolean;
        reason?: 'disabled' | 'missing-secrets' | 'no-consent' | 'connect-failed';
        toolCount?: number;
        error?: string;
      }>
    >;
    onMcpStatus: (cb: () => void) => () => void;
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
      userContext?: string;
      sessionId?: string;
      cwd?: string;
    }) => Promise<string | null>;
    /** Detect MERGE / REBASE / CHERRY_PICK state for a repo root. */
    mergeState: (repoRoot: string) => Promise<MergeState>;
    /** Fetch three-way content (base / ours / theirs / working) for a conflicted file. */
    conflictContent: (args: {
      repoRoot: string;
      relativePath: string;
      absolutePath: string;
    }) => Promise<ConflictContent>;
    /** Write resolved content to disk and run `git add` to mark conflict resolved. */
    resolveConflict: (args: {
      repoRoot: string;
      relativePath: string;
      absolutePath: string;
      content: string;
    }) => Promise<GitOperationResult>;
    /** Abort the current merge / rebase / cherry-pick operation. */
    abortOperation: (args: { repoRoot: string; type: string }) => Promise<GitOperationResult>;
    /** Complete the merge / cherry-pick / revert after all conflicts are resolved. */
    continueMerge: (args: {
      repoRoot: string;
      message: string;
      type: string;
    }) => Promise<GitOperationResult>;
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
  voice: {
    getModelStatus: () => Promise<'ready' | 'not-downloaded'>;
    downloadModel: () => Promise<'ready' | 'not-downloaded'>;
    startSession: () => Promise<void>;
    pushChunk: (samples: Float32Array) => Promise<string[]>;
    endSession: () => Promise<string[]>;
    /** Returns an unsubscribe function. */
    onDownloadProgress: (
      cb: (progress: { downloadedBytes: number; totalBytes: number | null }) => void,
    ) => () => void;
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
