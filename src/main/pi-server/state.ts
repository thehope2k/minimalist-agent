// Per-process shared state for the pi-server subprocess.
//
// There's exactly one AgentSession per subprocess, and one subprocess per
// chat session, so a single module-scoped singleton (mutated in place by
// every handler) is the simplest correct model here — no store/reducer
// needed. Extracted from index.ts so other pi-server modules can read/write
// it without importing the whole dispatch loop.
import type {
  AgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  MsgAuthRefreshResult,
  MsgBrowserToolResult,
  MsgCollaborationResponse,
  MsgEvent,
  MsgInit,
  MsgPreToolUseResponse,
  PiPermissionMode,
} from '../agent-runtime/backends/pi/protocol';
import type { LoadedAgent } from '../agents/types';
import type { PlanManager } from '../agent-runtime/planning/manager';
import type { ResolvedCompactionSettings } from '../../shared/compaction';
import type { Span } from '../../shared/otel';
import type { Context } from '@opentelemetry/api';
import type { InMemoryCredentialStore } from './credential-store';

export interface State {
  init?: MsgInit;
  credentialStore?: InMemoryCredentialStore;
  modelRuntime?: ModelRuntime;
  modelRegistry?: ModelRegistry;
  session?: AgentSession;
  resourceLoader?: DefaultResourceLoader;
  /** Available agents passed from main process. */
  availableAgents: LoadedAgent[];
  /** Mutable array passed by reference into resourceLoader — update in-place
   *  before reload() so per-turn context takes effect without recreating
   *  the session. */
  appendArr: string[];
  /** Last value pushed into appendArr — avoids a redundant reload(). */
  lastAppend?: string;
  model?: Model<Api>;
  /** Active model's image-input capability, per app metadata (MsgInit/MsgSetModel). */
  visionSupported?: boolean;
  /** True when the session targets a user-configured custom endpoint (local/OpenAI-compatible). Set once in handleInit; thinking level is pinned to 'minimal' for these. */
  hasCustomEndpoint?: boolean;
  permissionMode: PiPermissionMode;
  autonomyLevel: number;
  currentTurnId?: string;
  /** Effective compaction settings resolved at session construction (and
   *  re-resolved on every `set_model`, since it depends on the active
   *  model's contextWindow). */
  compactionSettings?: ResolvedCompactionSettings;
  /** The turn's terminal `turn_done`, buffered until session.prompt() settles.
   *  The pi SDK runs auto-compaction in its post-`agent_end` lifecycle, so the
   *  compaction events arrive after `agent_end`. We hold `turn_done` (which
   *  closes the per-turn channel) until the prompt fully settles, so those
   *  compaction events still reach the renderer. Flushed in handlePrompt. */
  pendingTurnDone?: MsgEvent;
  unsubscribe?: () => void;
  pendingPermission: Map<
    string,
    { resolve: (r: MsgPreToolUseResponse) => void }
  >;
  pendingCollaboration: Map<
    string,
    { resolve: (r: MsgCollaborationResponse) => void }
  >;
  pendingAuthRefresh: Map<string, { resolve: (r: MsgAuthRefreshResult) => void }>;
  pendingBrowserTool: Map<string, { resolve: (r: MsgBrowserToolResult) => void }>;
  planManager?: PlanManager;
  /** Adapted MCP tools from connected mcp-backed extensions, appended to every
   *  session build (init + model-switch recreate). */
  mcpTools: ToolDefinition<any, any>[];
  /** Live MCP clients, closed on shutdown. */
  mcpClients: import('@modelcontextprotocol/sdk/client/index.js').Client[];
  currentPhaseId?: string; // Track active phase for error attribution
  turnAbort?: AbortController;
  shuttingDown?: boolean;
  /** OTel span + context for the in-flight turn; child spans nest under it. */
  turnSpan?: Span;
  /** Last `sdkSessionId` pushed to main via `session_id_update` — avoids
   *  redundant sends when the underlying transcript file hasn't rotated. */
  lastSentSdkSessionId?: string;
  turnContext?: Context;
  /** OTel span for the in-flight provider/model request (one per assistant
   *  message; a tool loop produces several per turn). */
  modelSpan?: Span;
  /** OTel span for an auto-triggered (threshold/overflow) compaction. */
  autoCompactionSpan?: Span;
  /** Force-abort timer for a stalled auto-compaction summarization call —
   *  see {@link AUTO_COMPACTION_TIMEOUT_MS}. Cleared on `compaction_end`. */
  compactionWatchdog?: NodeJS.Timeout;
  /** Wall-clock start of the current model span, for time-to-first-token. */
  modelSpanStartMs?: number;
  modelFirstTokenSeen?: boolean;
  /** Per-turn model-call count, surfaced on the invoke_agent span. */
  modelRequestCount?: number;
  /** Accumulated assistant text for opt-in content capture on the turn span. */
  turnAssistantText?: string;
  /** Turn input (user message + system instructions), captured under
   *  captureContent, mirrored onto the turn's FIRST chat span so per-call input
   *  appears where GenAI consumers expect it. Reset at turn end. */
  turnInputAttrs?: Record<string, unknown>;
}

export const state: State = {
  permissionMode: 'auto',
  autonomyLevel: 50, // Default, will be overridden by init
  pendingPermission: new Map(),
  pendingCollaboration: new Map(),
  pendingAuthRefresh: new Map(),
  pendingBrowserTool: new Map(),
  appendArr: [],
  availableAgents: [],
  mcpTools: [],
  mcpClients: [],
  // planManager initialized in handleInit with sessions directory
};

/** Tags subprocess auth logs with this process's chat session id, so lines
 *  in the shared main.log can be attributed to one session without having
 *  to reverse-engineer it from message content. */
export function sessionTag(): string {
  return state.init?.sessionId ? `session=${state.init.sessionId}` : 'session=(pre-init)';
}
