// Main-process Pi backend.
//
// Owns the per-chat-session subprocess that runs `@earendil-works/pi-coding-agent`.
// Bridges JSONL events to the AgentChatEvent stream and handles OAuth refresh
// and mini-completion RPCs with main.
//
// Lifecycle:
//   1. First chat turn lazy-spawns `out/main/pi-server.js` under node
//   2. Sends `init` with credential + system prompt + initial mode
//   3. Awaits `ready`
//   4. Sends `prompt`; forwards `event` messages until `turn_done`/`error`
//   5. On window close / app quit / abort: sends `shutdown` then SIGKILL fallback
//
// Execution modes:
//   - Plan mode: Read-only tools (Read, Grep, Find, Ls) allowed, others blocked
//   - Auto mode: All tools allowed; agent uses collaboration tools for intelligent
//     engagement (RequestDecision, RequestPreference, RequestApproval, etc.)
//
// Token refresh:
//   When the subprocess detects an auth failure (typed `auth_required`),
//   we call `auth/resolve.ts` (which already mutexes), push the fresh
//   credential via `token_update`, and emit a typed expired_oauth_token
//   error so the UI offers a one-click retry.

import {type ChildProcess, spawn} from 'node:child_process';
import {resolveExtensionEnv} from '../../../extensions/env-resolver';
import {buildResolvedMcpServers, recordPiMcpStatus} from '../../../extensions/mcp-config';
import {createInterface, type Interface as ReadlineInterface} from 'node:readline';
import {app, BrowserWindow} from 'electron';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {resolvePiServerPath} from './spawn-utils';
import type {StoredAttachment} from '../../../storage/sessions';
import {updateSessionMeta} from '../../../storage/sessions';
import type {AgentChatEvent} from '../../events';
import {parseError} from '../../errors';
import {buildPromptPrefix, buildSystemPromptAppend,} from '../../system-prompt';
import {extractSkillPaths, formatSkillDirective} from '../../../skills/directive';
import type {PermissionMode} from '../../permissions';
import type {CopilotOAuthAuth, LocalApiAuth} from '../types';
import type {CollaborationAsk} from '../../../../shared/collaboration-types';
import type {EngagementRequest} from '../../../../shared/collaboration-types';
import {getActivePlan as getCachedPlan, updatePlanCache} from '../../plan-cache';
import {resolveAuthForSlug} from '../../../auth/resolve';
import {listConnections} from '../../../storage/connections';
import {telemetryEnv} from '../../../storage/telemetry';
import {loadAllAgents} from '../../../agents/storage';
import {createLogger} from '../../../logger';
import {writeJsonLine} from '../../../../shared/jsonl-stdin';

const log = createLogger('pi');
import type {
  MsgAuthRefreshRequest,
  MsgAuthRefreshResult,
  MsgAuthRequired,
  MsgCollaborationRequest,
  MsgEvent,
  MsgInit,
  MsgLlmQueryResult,
  MsgMiniCompletion,
  MsgMiniCompletionResult,
  MsgMcpStatus,
  MsgPreToolUseRequest,
  MsgPrompt,
  MsgReady,
  MsgSessionIdUpdate,
  MsgSetModel,
  MsgSetThinkingLevel,
  MsgTokenUpdate,
  PiAuthProvider,
  PiPromptImage,
  PiThinkingLevel,
  SubprocessInbound,
  SubprocessOutbound,
} from './protocol';

/* ============================================================ */
/*  Public types                                                 */
/* ============================================================ */

export interface PiChatRequest {
  /** Connection slug — needed by the resolver for mid-session token refresh. */
  connectionSlug: string;
  auth: CopilotOAuthAuth | LocalApiAuth;
  piAuthProvider?: PiAuthProvider;
  /** Renderer-side message id. */
  turnId: string;
  /** Our chat session id. */
  chatSessionId: string;
  /** Absolute path of the chat session's storage dir. */
  chatSessionPath: string;
  model: string;
  prompt: string;
  attachments?: StoredAttachment[];
  cwd?: string;
  thinkingLevel?: PiThinkingLevel;
  permissionMode?: PermissionMode;
  /** Collaboration callback for intelligent engagement tools. */
  askCollaboration?: CollaborationAsk;
  /** User's autonomy level (0-100) for intelligent collaboration. */
  autonomyLevel?: number;
  /** Scoped pinned asset slugs for this session ('user:<slug>' | 'project:<slug>'). */
  pinnedAssets?: string[];
  signal?: AbortSignal;
}

export interface PiMiniCompletionRequest {
  connectionSlug: string;
  auth: CopilotOAuthAuth | LocalApiAuth;
  piAuthProvider?: PiAuthProvider;
  chatSessionId: string;
  chatSessionPath: string;
  cwd?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

/* ============================================================ */
/*  Async event queue                                             */
/* ============================================================ */

class EventQueue {
  private buf: AgentChatEvent[] = [];
  private resolvers: Array<(v: AgentChatEvent | null) => void> = [];
  private done = false;

  push(ev: AgentChatEvent): void {
    if (this.done) return;
    const r = this.resolvers.shift();
    if (r) r(ev);
    else this.buf.push(ev);
  }

  finish(): void {
    this.done = true;
    while (this.resolvers.length) this.resolvers.shift()!(null);
  }

  next(): Promise<AgentChatEvent | null> {
    if (this.buf.length) return Promise.resolve(this.buf.shift()!);
    if (this.done) return Promise.resolve(null);
    return new Promise((res) => this.resolvers.push(res));
  }
}

/* ============================================================ */
/*  Subprocess handle                                            */
/* ============================================================ */

interface SubprocessHandle {
  child: ChildProcess;
  rl: ReadlineInterface;
  ready: Promise<void>;
  /** turnId → event queue. */
  queues: Map<string, EventQueue>;
  /** turnId → permission context (mode + sessionId). */
  permissionContext: Map<
    string,
    { mode: PermissionMode; sessionId: string }
  >;
  /** RequestId → resolver for mini_completion / llm_query. */
  pendingMini: Map<
    string,
    { resolve: (r: MsgMiniCompletionResult) => void }
  >;
  pendingLlm: Map<
    string,
    { resolve: (r: MsgLlmQueryResult) => void }
  >;
  stderrBuffer: string[];
  /** The chat session this subprocess serves. */
  chatSessionId: string;
  /** Connection slug, captured at spawn so refresh can mutex per-slug. */
  connectionSlug: string;
  /** Sub-provider (e.g. 'github-copilot' | 'openai-codex') for error messages. */
  piAuthProvider?: string;
  /** True while a token refresh is in progress for this handle. */
  refreshing?: boolean;
  /** Model ID currently active in the subprocess. */
  currentModel?: string;
  /** Thinking level currently active in the subprocess. */
  currentThinkingLevel?: PiThinkingLevel;
  /** Collaboration callback to show engagement dialogs. */
  askCollaboration?: CollaborationAsk;
}

/** Per-chat-session subprocess. */
const handles = new Map<string, SubprocessHandle>();

/* ============================================================ */
/*  Subprocess lifecycle                                         */
/* ============================================================ */

function send(handle: SubprocessHandle, msg: SubprocessInbound): void {
  writeJsonLine(handle.child.stdin, msg, log);
}

/**
 * Whether the given connection+model accepts image input, per the app's
 * stored connection metadata. Defaults to true when unknown so we never
 * over-strip for providers we don't track (the SDK still guards by model).
 */
function resolveVisionSupported(connectionSlug: string, modelId: string): boolean {
  const meta = listConnections().find((c) => c.slug === connectionSlug);
  const modelDef = meta?.models.find((m) => m.id === modelId);
  return modelDef?.supportsVision ?? true;
}

function ensureSubprocess(
  req: PiChatRequest,
  systemPrompt: string,
): SubprocessHandle {
  const key = req.chatSessionPath;
  const existing = handles.get(key);
  if (existing && !existing.child.killed) {
    // If the model changed, notify the running subprocess.
    if (req.model && req.model !== existing.currentModel) {
      const upd: MsgSetModel = {
        type: 'set_model',
        model: req.model,
        visionSupported: resolveVisionSupported(req.connectionSlug, req.model),
      };
      send(existing, upd);
      existing.currentModel = req.model;
    }
    // If the thinking level changed (session override or default toggled),
    // notify the running subprocess instead of respawning.
    const nextThinkingLevel = req.thinkingLevel ?? 'medium';
    if (nextThinkingLevel !== existing.currentThinkingLevel) {
      const upd: MsgSetThinkingLevel = {
        type: 'set_thinking_level',
        level: nextThinkingLevel,
      };
      send(existing, upd);
      existing.currentThinkingLevel = nextThinkingLevel;
    }
    return existing;
  }

  const handle = spawnSubprocess(req, systemPrompt);
  handles.set(key, handle);
  return handle;
}

/** Spawns a subprocess without registering it in the shared `handles` map — use for calls that must not touch a session's live connection. */
function spawnSubprocess(req: PiChatRequest, systemPrompt: string): SubprocessHandle {
  const key = req.chatSessionPath;
  const piServer = resolvePiServerPath(app.getAppPath());
  const child = spawn(process.execPath, [piServer], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Cli-bound extension env (resolved against the secret store).
      // Inherited by every Bash invocation inside pi-server via process.env.
      ...resolveExtensionEnv(req.cwd),
      ELECTRON_RUN_AS_NODE: '1',
      MINIMALIST_AGENT_VERSION: app.getVersion(),
      // Verbosity for the subprocess sub-logger (writes to stderr; the parent
      // pipes it into the on-disk log below). debug in dev, warn in prod.
      MA_LOG_LEVEL: process.env.MA_LOG_LEVEL ?? (app.isPackaged ? 'warn' : 'debug'),
      // Verbose Pi event logging — pipe-through to console.error so we can
      // see what the runtime actually emits. Set PI_DEBUG=0 to silence.
      PI_DEBUG: process.env.PI_DEBUG ?? '1',
      // OpenTelemetry tracing config (MA_OTEL_*). Empty when disabled; the
      // subprocess (src/shared/otel.ts) reads these at startup. Inherited by
      // sub-agent subprocesses too, so their traces land in the same sink.
      ...telemetryEnv(),
    },
  });

  const stderrBuffer: string[] = [];
  child.stderr?.setEncoding('utf-8');
  child.stderr?.on('data', (chunk: string) => {
    stderrBuffer.push(chunk);
    if (stderrBuffer.length > 50) stderrBuffer.shift();
    log.error(chunk.trim());
  });

  const queues = new Map<string, EventQueue>();
  const permissionContext = new Map<
    string,
    { mode: PermissionMode; sessionId: string }
  >();
  const pendingMini = new Map<
    string,
    { resolve: (r: MsgMiniCompletionResult) => void }
  >();
  const pendingLlm = new Map<
    string,
    { resolve: (r: MsgLlmQueryResult) => void }
  >();

  const rl = createInterface({ input: child.stdout! });

  let resolveReady: () => void;
  let rejectReady: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });

  const handle: SubprocessHandle = {
    child,
    rl,
    ready,
    queues,
    permissionContext,
    pendingMini,
    pendingLlm,
    stderrBuffer,
    chatSessionId: req.chatSessionId,
    connectionSlug: req.connectionSlug,
    piAuthProvider: req.piAuthProvider,
    currentModel: req.model,
    currentThinkingLevel: req.thinkingLevel ?? 'medium',
    askCollaboration: req.askCollaboration,
  };

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: SubprocessOutbound;
    try {
      msg = JSON.parse(line) as SubprocessOutbound;
    } catch {
      log.error('bad JSONL:', line.slice(0, 200));
      return;
    }
    void handleOutbound(msg, handle, resolveReady, rejectReady);
  });

  child.on('exit', (code) => {
    for (const q of queues.values()) q.finish();
    queues.clear();
    permissionContext.clear();
    for (const p of pendingMini.values()) {
      p.resolve({
        type: 'mini_completion_result',
        requestId: '',
        error: 'subprocess exited',
      });
    }
    pendingMini.clear();
    for (const p of pendingLlm.values()) {
      p.resolve({
        type: 'llm_query_result',
        requestId: '',
        error: 'subprocess exited',
      });
    }
    pendingLlm.clear();
    // Only clear the registry entry if it still points at this handle —
    // an unregistered isolated handle must never delete a live session's entry.
    if (handles.get(key) === handle) {
      handles.delete(key);
    }
    if (code !== 0 && code !== null) {
      log.error(
        `exited with code ${code}\n${stderrBuffer.join('')}`,
      );
    }
  });

  const isLocal = req.auth.type === 'local_api';
  const localAuth = isLocal ? (req.auth as LocalApiAuth) : undefined;
  const baseUrl = localAuth?.baseUrl;

  // For custom endpoints, derive protocol + capabilities from the connection
  // meta and the model the turn actually uses. Local Ollama needs the qwen
  // enable_thinking hack; remote OpenAI-compatible providers don't.
  let customEndpoint: MsgInit['customEndpoint'];
  if (isLocal) {
    const meta = listConnections().find((c) => c.slug === req.connectionSlug);
    const modelDef = meta?.models.find((m) => m.id === req.model);
    const isOpenAICompat = meta?.providerType === 'openai-compatible';
    customEndpoint = {
      api: 'openai-completions' as const,
      supportsImages: modelDef?.supportsVision ?? false,
      contextWindow: modelDef?.contextWindow,
      maxTokens: modelDef?.maxOutputTokens,
      reasoning: modelDef?.supportsReasoning ?? false,
      ...(isOpenAICompat ? {} : { thinkingFormat: 'qwen' as const }),
    };
  }

  // Send init.
  const init: MsgInit = {
    type: 'init',
    sessionId: req.chatSessionId,
    sessionPath: req.chatSessionPath,
    cwd: req.cwd ?? app.getPath('home'),
    model: req.model,
    visionSupported: resolveVisionSupported(req.connectionSlug, req.model),
    thinkingLevel: req.thinkingLevel ?? 'medium',
    providerType: 'pi',
    authType: 'oauth',
    piAuthProvider: req.piAuthProvider ?? 'github-copilot',
    piAuth: isLocal
      ? { provider: 'openai', credential: { type: 'api_key', key: localAuth?.apiKey ?? 'local' } }
      : {
          provider: req.piAuthProvider!,
          credential: req.piAuthProvider === 'github-copilot'
            ? {
                type: 'oauth',
                access: (req.auth as CopilotOAuthAuth).accessToken,
                refresh: (req.auth as CopilotOAuthAuth).refreshToken ?? '',
                expires: (req.auth as CopilotOAuthAuth).expiresAt,
              }
            : {
                type: 'api_key',
                key: (req.auth as CopilotOAuthAuth).accessToken,
              },
        },
    ...(baseUrl ? { baseUrl, customEndpoint } : {}),
    permissionMode: (req.permissionMode ?? 'auto') as MsgInit['permissionMode'],
    autonomyLevel: req.autonomyLevel,
    systemPrompt,
    availableAgents: loadAllAgents().map(a => ({
      slug: a.slug,
      metadata: a.metadata,
      content: a.content,
      path: a.path,
      iconPath: a.iconPath,
    })),
    mcpServers: buildResolvedMcpServers(req.cwd),
  };
  send(handle, init);

  return handle;
}

/** Persists the Pi SDK's transcript-file id on session meta, stable for a
 *  session's lifetime unless an extension forks/rotates it mid-conversation. */
function persistPiSessionId(chatSessionId: string, piSessionId: string): void {
  try {
    updateSessionMeta(chatSessionId, { sdkSessionId: piSessionId });
  } catch (e) {
    log.error('failed to persist piSessionId:', e);
  }
}

async function handleOutbound(
  msg: SubprocessOutbound,
  handle: SubprocessHandle,
  resolveReady: () => void,
  rejectReady: (e: Error) => void,
): Promise<void> {
  switch (msg.type) {
    case 'ready': {
      const m = msg as MsgReady;
      if (m.piSessionId) persistPiSessionId(handle.chatSessionId, m.piSessionId);
      resolveReady();
      return;
    }

    case 'event': {
      const m = msg as MsgEvent;
      const q = handle.queues.get(m.turnId);
      if (!q) return;
      q.push(m.event);
      if (m.event.type === 'turn_done' || m.event.type === 'error') {
        q.finish();
        handle.queues.delete(m.turnId);
        handle.permissionContext.delete(m.turnId);
      }
      return;
    }

    case 'pre_tool_use_request': {
      const req = msg as MsgPreToolUseRequest;
      const ctx = handle.permissionContext.get(req.turnId);
      if (!ctx) {
        // No context registered → block conservatively. Should not happen
        // in a normal flow, but covers a stray request after turn end.
        send(handle, {
          type: 'pre_tool_use_response',
          requestId: req.requestId,
          action: 'block',
          reason: 'No permission context for this turn',
        });
        return;
      }
      const decision: { action: 'allow' | 'block'; reason?: string } = { action: 'allow', reason: undefined };
      
      // In plan mode, block write operations
      if (ctx.mode === 'plan') {
        const readOnlyTools = new Set(['Read', 'Grep', 'Find', 'Ls']);
        if (!readOnlyTools.has(req.toolName)) {
          decision.action = 'block';
          decision.reason = 'Plan mode: write operations not allowed';
        }
      }
      // In auto mode, allow all tools (agent uses collaboration tools for engagement)
      
      send(handle, {
        type: 'pre_tool_use_response',
        requestId: req.requestId,
        action: decision.action,
        reason: decision.reason,
      });
      return;
    }

    case 'collaboration_request': {
      const req = msg as MsgCollaborationRequest;
      
      // Forward to askCollaboration callback if available
      if (!handle.askCollaboration) {
        log.warn('Collaboration request received but no askCollaboration callback');
        // Return a default "no" response
        send(handle, {
          type: 'collaboration_response',
          requestId: req.requestId,
          response: {
            type: req.engagementType,
            decision: 'denied',
            custom_response: 'Collaboration not available',
          },
        });
        return;
      }

      // Convert to EngagementRequest format
      const engagementRequest: EngagementRequest = {
        reqId: req.requestId,
        turnId: req.turnId,
        sessionId: req.sessionId,
        type: req.engagementType,
        payload: req.payload as any, // Payload is validated by collaboration handlers
      };

      // Call the renderer callback
      handle.askCollaboration(engagementRequest)
        .then((response: any) => {
          send(handle, {
            type: 'collaboration_response',
            requestId: req.requestId,
            response,
          });
        })
        .catch((err: any) => {
          log.error('Collaboration request failed:', err);
          send(handle, {
            type: 'collaboration_response',
            requestId: req.requestId,
            response: {
              type: req.engagementType,
              decision: 'denied',
              custom_response: 'Error: ' + String(err),
            },
          });
        });
      return;
    }

    // Planning workflow events - forward to renderer via IPC and update cache
    case 'planning:created':
    case 'planning:updated': {
      const { plan, sessionId = handle.chatSessionId } = msg as any;
      if (plan) {
        // Update the cache so getActivePlan returns the latest state
        updatePlanCache(sessionId, plan);

        // Forward to renderer
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send(msg.type, { sessionId, plan });
        }
      }
      return;
    }

    case 'planning:phase-updated': {
      const { sessionId = handle.chatSessionId, planId, phase } = msg as any;
      // Update the cached plan's phase
      const cachedPlan = getCachedPlan(sessionId);
      if (cachedPlan && cachedPlan.id === planId) {
        const phaseIndex = cachedPlan.phases.findIndex((p: any) => p.id === phase.id);
        if (phaseIndex >= 0) {
          cachedPlan.phases[phaseIndex] = phase;
          updatePlanCache(sessionId, cachedPlan);
        }
      }

      // Forward to renderer
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send(msg.type, { sessionId, planId, phase });
      }
      return;
    }

    case 'planning:revised': {
      const { sessionId = handle.chatSessionId, plan, revision } = msg as any;
      if (plan) {
        updatePlanCache(sessionId, plan);

        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send(msg.type, { sessionId, plan, revision });
        }
      }
      return;
    }

    case 'planning:completed':
    case 'planning:cancelled': {
      const { sessionId = handle.chatSessionId, planId } = msg as any;

      // Update cache status or remove
      if (msg.type === 'planning:cancelled') {
        updatePlanCache(sessionId, null);
      } else {
        const cachedPlan = getCachedPlan(sessionId);
        if (cachedPlan && cachedPlan.id === planId) {
          cachedPlan.status = 'completed';
          updatePlanCache(sessionId, cachedPlan);
        }
      }

      // Forward to renderer
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed() && planId) {
        win.webContents.send(msg.type, { sessionId, planId });
      }
      return;
    }

    case 'planning:error': {
      const { sessionId = handle.chatSessionId, planId, error, phaseId } = msg as any;

      // Update cache to error status
      const cachedPlan = getCachedPlan(sessionId);
      if (cachedPlan && cachedPlan.id === planId) {
        cachedPlan.status = 'error';
        updatePlanCache(sessionId, cachedPlan);
      }

      // Forward to renderer
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send(msg.type, { sessionId, planId, error, phaseId });
      }
      return;
    }

    case 'planning:approval-required': {
      const { sessionId = handle.chatSessionId, planId, phase } = msg as any;

      // Forward to renderer to show approval dialog
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send(msg.type, { sessionId, planId, phase });
      }
      return;
    }

    case 'permission_mode_changed': {
      const { sessionId = handle.chatSessionId, mode } = msg as any;

      // CRITICAL: Update permission context for all active turns
      // When user approves a phase in plan mode, we switch to auto,
      // but the turn's permission context is cached from turn start.
      // Without this update, tools still get blocked by the plan mode guard.
      for (const ctx of handle.permissionContext.values()) {
        if (ctx.sessionId === sessionId) {
          ctx.mode = mode;
        }
      }

      // Update session metadata to persist the mode change
      try {
        updateSessionMeta(sessionId, { permissionMode: mode });
      } catch (e) {
        log.error('Failed to persist permission mode:', e);
      }

      // Forward to renderer to update UI
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('permission-mode-changed', { sessionId, mode });
      }
      return;
    }

    case 'session_id_update': {
      const m = msg as MsgSessionIdUpdate;
      persistPiSessionId(handle.chatSessionId, m.piSessionId);
      return;
    }

    case 'auth_refresh_request': {
      const m = msg as MsgAuthRefreshRequest;
      try {
        const fresh = await resolveAuthForSlug(handle.connectionSlug);
        const result: MsgAuthRefreshResult =
          fresh.type === 'copilot_oauth'
            ? {
                type: 'auth_refresh_result',
                requestId: m.requestId,
                credential: {
                  access: fresh.accessToken,
                  refresh: fresh.refreshToken ?? '',
                  expires: fresh.expiresAt,
                },
              }
            : {
                type: 'auth_refresh_result',
                requestId: m.requestId,
                error: `Connection "${handle.connectionSlug}" has no OAuth credential to refresh`,
              };
        send(handle, result);
      } catch (e) {
        send(handle, {
          type: 'auth_refresh_result',
          requestId: m.requestId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    case 'mcp_status': {
      const { sessionId = handle.chatSessionId, servers } = msg as MsgMcpStatus;
      // Runtime connection outcome for mcp-backed extensions. Cache it so the
      // extensions:mcp.status IPC reflects live connect failures, not just
      // config-level blockers, and forward to the renderer for surfacing.
      recordPiMcpStatus(servers);
      for (const s of servers) {
        if (s.ok) {
          log.info(`MCP ${s.slug} connected (${s.toolCount ?? 0} tool(s))`);
        } else {
          log.warn(`MCP ${s.slug} failed: ${s.error ?? 'unknown error'}`);
        }
      }
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('mcp-status', { sessionId, servers });
      }
      return;
    }

    case 'mini_completion_result': {
      const m = msg as MsgMiniCompletionResult;
      const p = handle.pendingMini.get(m.requestId);
      if (p) {
        handle.pendingMini.delete(m.requestId);
        p.resolve(m);
      }
      return;
    }

    case 'llm_query_result': {
      const m = msg as MsgLlmQueryResult;
      const p = handle.pendingLlm.get(m.requestId);
      if (p) {
        handle.pendingLlm.delete(m.requestId);
        p.resolve(m);
      }
      return;
    }

    case 'auth_required': {
      const m = msg as MsgAuthRequired;
      // Refresh once, push token_update; we don't auto-retry the turn
      // (Pi already errored it). The user can re-send.
      if (handle.refreshing) return;
      handle.refreshing = true;
      try {
        const fresh = await resolveAuthForSlug(handle.connectionSlug);
        if (fresh.type === 'copilot_oauth') {
          const upd: MsgTokenUpdate = {
            type: 'token_update',
            credential: handle.piAuthProvider === 'github-copilot'
              ? {
                  type: 'oauth',
                  access: fresh.accessToken,
                  refresh: fresh.refreshToken ?? '',
                  expires: fresh.expiresAt,
                }
              : {
                  type: 'api_key',
                  key: fresh.accessToken,
                },
          };
          send(handle, upd);
        }
      } catch (e) {
        log.error('token refresh failed:', e);
      } finally {
        handle.refreshing = false;
      }
      // Surface to the active turn so the UI shows a retry-able error.
      if (m.turnId) {
        const q = handle.queues.get(m.turnId);
        if (q) {
          const isChatGpt = handle.piAuthProvider === 'openai-codex';
          q.push({
            type: 'error',
            error: {
              code: 'expired_oauth_token',
              title: isChatGpt ? 'ChatGPT Plus session expired' : 'GitHub Copilot session expired',
              message: isChatGpt
                ? 'Your ChatGPT Plus token was refreshed. Re-send the message to continue.'
                : 'Your Copilot token was refreshed. Re-send the message to continue.',
              canRetry: true,
              originalError: m.message,
            },
          });
          q.finish();
          handle.queues.delete(m.turnId);
        }
      }
      return;
    }

    case 'error': {
      const m = msg as { message: string };
      for (const q of handle.queues.values()) {
        q.push({ type: 'error', error: parseError(new Error(m.message)) });
        q.finish();
      }
      handle.queues.clear();
      rejectReady(new Error(m.message));
      return;
    }
  }
}

/* ============================================================ */
/*  Public API: chat turn                                        */
/* ============================================================ */

const SDK_IMAGE_MEDIA = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/**
 * Prepend text/snippet/pdf-text attachments to the prompt so the Pi
 * backend receives their content (Pi only supports images natively).
 */
function buildPiPrompt(prompt: string, attachments?: StoredAttachment[]): string {
  if (!attachments?.length) return prompt;
  const parts: string[] = [];
  for (const att of attachments) {
    if (att.type === 'text' || att.type === 'snippet') {
      try {
        const content = readFileSync(att.storedPath, 'utf-8');
        parts.push(`[File: ${att.name}]\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        parts.push(`[File: ${att.name}] (unreadable)`);
      }
    }
    // PDFs and images are handled separately (images via buildImages,
    // PDFs are binary — skip for now as Pi has no document block type).
  }
  return parts.length > 0 ? `${parts.join('\n\n')}\n\n${prompt}` : prompt;
}

function buildImages(attachments?: StoredAttachment[]): PiPromptImage[] | undefined {
  if (!attachments?.length) return undefined;
  const out: PiPromptImage[] = [];
  for (const att of attachments) {
    if (att.type !== 'image') continue;
    if (!SDK_IMAGE_MEDIA.has(att.mimeType)) continue;
    let data = att.resizedBase64;
    if (!data) {
      try { data = readFileSync(att.storedPath).toString('base64'); }
      catch { continue; }
    }
    out.push({ type: 'image', data, mimeType: att.mimeType });
  }
  return out.length ? out : undefined;
}

export async function* runPiChat(
  req: PiChatRequest,
): AsyncGenerator<AgentChatEvent> {
  // Compute append for subprocess init. May be empty on the very first turn
  // of a new session if initSessionState hasn't completed yet (race with the
  // React useEffect that fires after the send handler). Re-computed after
  // handle.ready to capture any state that settled during the spawn window.
  const initAppend = buildSystemPromptAppend({
    cwd: req.cwd,
    sessionId: req.chatSessionId,
    userMessage: req.prompt,
    authType: req.auth.type,
    piAuthProvider: req.piAuthProvider,
    model: req.model,
    autonomyLevel: req.autonomyLevel,
  });
  const prefix = buildPromptPrefix({
    cwd: req.cwd,
    scratchDir: join(req.chatSessionPath, 'scratch'),
    pinnedAssets: req.pinnedAssets,
  });

  // Resolve `@slug` / `@path` mentions exactly as the Anthropic backend does.
  const { skillPaths, extensionGuidePaths, filePaths, folderPaths, cleanMessage, missingSkills, missingFiles } =
    extractSkillPaths(req.prompt, req.cwd);
  if (missingSkills.length > 0) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          `Mention(s) not found: ${missingSkills.join(', ')}. ` +
            `Skills live under ~/.agents/skills/<slug>/ or <cwd>/.agents/skills/<slug>/. ` +
            `Extensions must be installed and enabled.`,
        ),
      ),
    };
    return;
  }
  if (missingFiles.length > 0) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          `File mention(s) not found: ${missingFiles.join(', ')}. ` +
            `Paths must be relative to the working directory (e.g. @docs/ROADMAP.md).`,
        ),
      ),
    };
    return;
  }
  const directive = formatSkillDirective(skillPaths, extensionGuidePaths, filePaths, folderPaths);

  let handle: SubprocessHandle;
  try {
    handle = ensureSubprocess(req, initAppend);
    await handle.ready;
  } catch (e) {
    yield { type: 'error', error: parseError(e) };
    return;
  }

  // Re-compute after ready: initSessionState may have completed during spawn.
  const append = buildSystemPromptAppend({
    cwd: req.cwd,
    sessionId: req.chatSessionId,
    userMessage: req.prompt,
    authType: req.auth.type,
    piAuthProvider: req.piAuthProvider,
    model: req.model,
    autonomyLevel: req.autonomyLevel,
  });

  // Update mode in case the user changed it between turns.
  send(handle, { type: 'set_permission_mode', mode: req.permissionMode ?? 'auto' });

  // Register permission context for this turn.
  handle.permissionContext.set(req.turnId, {
    mode: req.permissionMode ?? 'auto',
    sessionId: req.chatSessionId,
  });

  const queue = new EventQueue();
  handle.queues.set(req.turnId, queue);

  const finalPrompt = [prefix, directive, cleanMessage].filter(Boolean).join('\n\n');
  const promptMsg: MsgPrompt = {
    type: 'prompt',
    turnId: req.turnId,
    message: buildPiPrompt(finalPrompt, req.attachments),
    images: buildImages(req.attachments),
    systemPromptAppend: append,
  };
  send(handle, promptMsg);

  const onAbort = () => {
    send(handle, { type: 'abort', turnId: req.turnId });
  };
  if (req.signal) {
    if (req.signal.aborted) onAbort();
    else req.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    for (;;) {
      const ev = await queue.next();
      if (!ev) {
        yield { type: 'turn_done' };
        return;
      }
      yield ev;
      if (ev.type === 'turn_done' || ev.type === 'error') return;
    }
  } finally {
    if (req.signal) req.signal.removeEventListener('abort', onAbort);
    handle.permissionContext.delete(req.turnId);
  }
}

/* ============================================================ */
/*  Public API: mini completion (title gen / cheap one-shots)    */
/* ============================================================ */

export async function runPiMiniCompletion(
  req: PiMiniCompletionRequest,
): Promise<{ text?: string; error?: string }> {
  const piReq: PiChatRequest = {
    connectionSlug: req.connectionSlug,
    auth: req.auth,
    piAuthProvider: req.piAuthProvider,
    turnId: 'mini',
    chatSessionId: req.chatSessionId,
    chatSessionPath: req.chatSessionPath,
    model: req.model,
    prompt: '',
    cwd: req.cwd,
  };

  // A different target model must not switch the session's live subprocess
  // mid-flight — use an isolated subprocess instead.
  const existing = handles.get(req.chatSessionPath);
  const wouldHijackLiveModel =
    !!existing && !existing.child.killed && !!req.model && req.model !== existing.currentModel;

  let handle: SubprocessHandle;
  try {
    handle = wouldHijackLiveModel ? spawnSubprocess(piReq, '') : ensureSubprocess(piReq, '');
    await handle.ready;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const requestId = `mini_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const result = await new Promise<MsgMiniCompletionResult>((resolve) => {
      handle.pendingMini.set(requestId, { resolve });
      const m: MsgMiniCompletion = {
        type: 'mini_completion',
        requestId,
        systemPrompt: req.systemPrompt,
        userPrompt: req.userPrompt,
        model: req.model,
        maxTokens: req.maxTokens,
      };
      send(handle, m);
    });
    return {
      text: result.text,
      error: result.error,
    };
  } finally {
    if (wouldHijackLiveModel) killSubprocess(handle);
  }
}

/** Tears down a single subprocess: request shutdown, force-kill if it doesn't exit in time. */
const SIGKILL_FALLBACK_DELAY_MS = 1000;

function killSubprocess(handle: SubprocessHandle): void {
  try { send(handle, { type: 'shutdown' }); } catch { /* */ }
  setTimeout(() => {
    if (!handle.child.killed) {
      try { handle.child.kill('SIGKILL'); } catch { /* */ }
    }
  }, SIGKILL_FALLBACK_DELAY_MS);
}

/* ============================================================ */
/*  Public API: steer (inject mid-turn user message)             */
/* ============================================================ */

/**
 * Inject a user message into an in-flight Pi turn. Returns true if a
 * subprocess was found for the chat session; false otherwise (e.g. the
 * turn already completed).
 */
export function steerPiTurn(args: {
  chatSessionPath: string;
  turnId: string;
  message: string;
  attachments?: StoredAttachment[];
}): boolean {
  const handle = handles.get(args.chatSessionPath);
  if (!handle || !handle.queues.has(args.turnId)) return false;
  send(handle, {
    type: 'steer',
    turnId: args.turnId,
    message: buildPiPrompt(args.message, args.attachments),
    images: buildImages(args.attachments),
  });
  return true;
}

/* ============================================================ */
/*  Cleanup                                                       */
/* ============================================================ */

export function shutdownAllPiSubprocesses(): void {
  for (const handle of handles.values()) {
    killSubprocess(handle);
  }
  handles.clear();
}

/**
 * Send approval response for a phase to the subprocess.
 * Returns true if the subprocess was found and message sent.
 */
export function sendPlanApprovalResponse(args: {
  chatSessionPath: string;
  phaseId: string;
  approved: boolean;
  notes?: string;
}): boolean {
  const handle = handles.get(args.chatSessionPath);
  if (!handle) return false;
  
  send(handle, {
    type: 'planning:approval-response',
    sessionId: handle.chatSessionId,
    phaseId: args.phaseId,
    approved: args.approved,
    notes: args.notes,
  });
  
  return true;
}
