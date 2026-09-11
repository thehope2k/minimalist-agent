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

import {spawn} from 'node:child_process';
import {resolveExtensionEnv} from '../../../extensions/env-resolver';
import {buildResolvedMcpServers} from '../../../extensions/mcp-config';
import {createInterface} from 'node:readline';
import {app} from 'electron';
import {join} from 'node:path';
import {resolvePiServerPath} from './spawn-utils';
import type {StoredAttachment} from '../../../storage/sessions';
import type {AgentChatEvent} from '../../events';
import {parseError} from '../../errors';
import type {AgentError} from '../../errors';
import {buildPromptPrefix, buildSystemPromptAppend,} from '../../system-prompt';
import {extractSkillPaths, formatSkillDirective} from '../../../skills/directive';
import {formatAttachmentsDirective} from '../../attachments-directive';
import type {PermissionMode} from '../../permissions';
import type {CopilotOAuthAuth, LocalApiAuth} from '../types';
import type {CollaborationAsk} from '../../../../shared/collaboration-types';
import {listConnections} from '../../../storage/connections';
import {telemetryEnv} from '../../../storage/telemetry';
import {loadAllAgents} from '../../../agents/storage';
import {getSettings} from '../../../storage/settings';
import {createLogger} from '../../../logger';
import {TURN_IDLE_TIMEOUT_MS, WATCHDOG_SWEEP_MS} from '../../../../shared/timeouts';
import {EventQueue, send, type SubprocessHandle} from './subprocess-handle';
import {dispatchOutbound} from './outbound';

const log = createLogger('pi');
import type {
  MsgInit,
  MsgLlmQueryResult,
  MsgManualCompact,
  MsgMiniCompletion,
  MsgMiniCompletionResult,
  MsgPrompt,
  MsgSetModel,
  MsgSetThinkingLevel,
  PiAuthProvider,
  PiThinkingLevel,
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
/*  Subprocess handle (shared type + `send`)                      */
/* ============================================================ */

/** Per-chat-session subprocess. */
const handles = new Map<string, SubprocessHandle>();


function forceRetireHandle(key: string, handle: SubprocessHandle, error: AgentError): void {
  for (const q of handle.queues.values()) {
    q.push({ type: 'error', error });
    q.finish();
  }
  handle.queues.clear();
  handle.permissionContext.clear();
  killSubprocess(handle);
  if (handles.get(key) === handle) handles.delete(key);
}

function reapStuckHandle(key: string, handle: SubprocessHandle, idleMs: number): void {
  const operation = handle.currentOperation;
  const stuckOn = operation ? ` while running "${operation}"` : '';
  log.error(
    `Subprocess for session ${handle.chatSessionId} silent for ${Math.round(idleMs / 1000)}s${stuckOn} ` +
      `with ${handle.queues.size} turn(s) in flight — force-recovering.`,
  );
  forceRetireHandle(key, handle, {
    code: 'network_error',
    title: 'Turn timed out',
    message:
      'This turn stopped responding and was reset automatically after ' +
      `${Math.round(TURN_IDLE_TIMEOUT_MS / 60_000)} minute(s) of silence — usually a stalled network ` +
      'connection. Send your message again.',
    canRetry: true,
    originalError: `watchdog: no subprocess activity for ${Math.round(idleMs / 1000)}s${stuckOn}`,
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, handle] of handles) {
    if (handle.queues.size === 0) continue; // no active turn — idle is expected
    if (handle.pendingCollaborationRequests > 0) continue; // waiting on human input, not stuck
    const idleMs = now - handle.lastActivityAt;
    if (idleMs > TURN_IDLE_TIMEOUT_MS) reapStuckHandle(key, handle, idleMs);
  }
}, WATCHDOG_SWEEP_MS).unref();

/* ============================================================ */
/*  Subprocess lifecycle                                         */
/* ============================================================ */

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
  if (existing && !existing.child.killed && existing.connectionSlug !== req.connectionSlug) {
    forceRetireHandle(key, existing, {
      code: 'network_error',
      title: 'Connection changed',
      message: 'The connection changed while this turn was still running, so it was interrupted. Send your message again.',
      canRetry: true,
    });
    const fresh = spawnSubprocess(req, systemPrompt);
    handles.set(key, fresh);
    return fresh;
  }
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
    { mode: PermissionMode; sessionId: string; cwd?: string }
  >();
  const turnSignals = new Map<string, AbortSignal>();
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
    turnSignals,
    pendingMini,
    pendingLlm,
    stderrBuffer,
    chatSessionId: req.chatSessionId,
    connectionSlug: req.connectionSlug,
    piAuthProvider: req.piAuthProvider,
    currentModel: req.model,
    currentThinkingLevel: req.thinkingLevel ?? 'medium',
    askCollaboration: req.askCollaboration,
    pendingCollaborationRequests: 0,
    lastActivityAt: Date.now(),
  };

  rl.on('line', (line) => {
    handle.lastActivityAt = Date.now();
    if (!line.trim()) return;
    let msg: SubprocessOutbound;
    try {
      msg = JSON.parse(line) as SubprocessOutbound;
    } catch {
      log.error('bad JSONL:', line.slice(0, 200));
      return;
    }
    void dispatchOutbound(msg, handle, resolveReady, rejectReady);
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
    const isOpenAICompat = meta?.providerType === 'openai-compatible' || meta?.providerType === 'codemie-sso';
    customEndpoint = {
      api: 'openai-completions' as const,
      supportsImages: modelDef?.supportsVision ?? false,
      contextWindow: modelDef?.contextWindow,
      maxTokens: modelDef?.maxOutputTokens,
      reasoning: modelDef?.supportsReasoning ?? false,
      ...(isOpenAICompat ? {} : { thinkingFormat: 'qwen' as const }),
    };
  }

  const compactionSettings = getSettings().compactionSettings;

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
          credential: {
            type: 'oauth',
            access: (req.auth as CopilotOAuthAuth).accessToken,
            refresh: (req.auth as CopilotOAuthAuth).refreshToken ?? '',
            expires: (req.auth as CopilotOAuthAuth).expiresAt,
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
    compactionSettings,
  };
  send(handle, init);

  return handle;
}

/* ============================================================ */
/*  Public API: chat turn                                        */
/* ============================================================ */

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
    sessionId: req.chatSessionId,
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
  const attachmentsDirective = formatAttachmentsDirective(req.attachments);

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
    cwd: req.cwd,
  });
  if (req.signal) handle.turnSignals.set(req.turnId, req.signal);

  const queue = new EventQueue();
  handle.queues.set(req.turnId, queue);

  const finalPrompt = [prefix, directive, attachmentsDirective, cleanMessage].filter(Boolean).join('\n\n');
  const promptMsg: MsgPrompt = {
    type: 'prompt',
    turnId: req.turnId,
    message: finalPrompt,
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
    handle.turnSignals.delete(req.turnId);
  }
}

/* ============================================================ */
/*  Public API: manual compaction trigger                         */
/* ============================================================ */

/**
 * Triggers manual compaction via the persistent Pi subprocess for this chat
 * session, streaming compaction_start/compaction_end events through a
 * synthetic per-turn `EventQueue`, like {@link runPiChat} does for a real
 * turn. Requires a live subprocess for this session.
 */
export async function* runPiManualCompact(req: {
  chatSessionPath: string;
  turnId: string;
  customInstructions?: string;
  signal?: AbortSignal;
}): AsyncGenerator<AgentChatEvent> {
  const handle = handles.get(req.chatSessionPath);
  if (!handle || handle.child.killed) {
    yield {
      type: 'error',
      error: {
        code: 'unknown_error',
        title: 'No active session',
        message: 'Start a chat turn before compacting — there is no running session to compact yet.',
        canRetry: false,
      },
    };
    return;
  }

  const queue = new EventQueue();
  handle.queues.set(req.turnId, queue);
  if (req.signal) handle.turnSignals.set(req.turnId, req.signal);

  const msg: MsgManualCompact = {
    type: 'manual_compact',
    turnId: req.turnId,
    customInstructions: req.customInstructions,
  };
  send(handle, msg);

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
    handle.queues.delete(req.turnId);
    handle.turnSignals.delete(req.turnId);
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
}): boolean {
  const handle = handles.get(args.chatSessionPath);
  if (!handle || !handle.queues.has(args.turnId)) return false;
  send(handle, {
    type: 'steer',
    turnId: args.turnId,
    message: args.message,
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
