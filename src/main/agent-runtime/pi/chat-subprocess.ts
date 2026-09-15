// Main-process subprocess registry, spawn, and watchdog lifecycle.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { app } from 'electron';
import { resolveExtensionEnv } from '../../extensions/env-resolver';
import { buildResolvedMcpServers } from '../../extensions/mcp-config';
import { listConnections } from '../../storage/connections';
import { telemetryEnv } from '../../storage/telemetry';
import { loadAllAgents } from '../../agents/storage';
import { getSettings } from '../../storage/settings';
import { createLogger } from '../../logger';
import { TURN_IDLE_TIMEOUT_MS, WATCHDOG_SWEEP_MS } from '../../../shared/timeouts';
import type { AgentError } from '../errors';
import type { PermissionMode } from '../permissions';
import { resolvePiServerPath } from './spawn-utils';
import { EventQueue, send, type SubprocessHandle } from './subprocess-handle';
import { dispatchOutbound } from './outbound';
import type { ChatRequest } from './agent';
import type {
  MsgInit,
  MsgLlmQueryResult,
  MsgMiniCompletionResult,
  MsgSetModel,
  MsgSetThinkingLevel,
  SubprocessOutbound,
} from './protocol';

const log = createLogger('chat-runtime');

const SIGKILL_FALLBACK_DELAY_MS = 1000;

export function killSubprocess(handle: SubprocessHandle): void {
  try {
    send(handle, { type: 'shutdown' });
  } catch {
    /* best-effort */
  }
  setTimeout(() => {
    if (!handle.child.killed) {
      try {
        handle.child.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
    }
  }, SIGKILL_FALLBACK_DELAY_MS);
}

/** Per-chat-session subprocess. */
export const handles = new Map<string, SubprocessHandle>();

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

export function ensureSubprocess(req: ChatRequest, systemPrompt: string): SubprocessHandle {
  const key = req.chatSessionPath;
  const existing = handles.get(key);
  if (existing && !existing.child.killed && existing.connectionSlug !== req.connectionSlug) {
    forceRetireHandle(key, existing, {
      code: 'network_error',
      title: 'Connection changed',
      message:
        'The connection changed while this turn was still running, so it was interrupted. Send your message again.',
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
export function spawnSubprocess(req: ChatRequest, systemPrompt: string): SubprocessHandle {
  const key = req.chatSessionPath;
  const modelProvider = req.auth.type === 'api' ? 'openai' : req.auth.provider;
  const serverPath = resolvePiServerPath(app.getAppPath());
  const child = spawn(process.execPath, [serverPath], {
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
  const pendingMini = new Map<string, { resolve: (r: MsgMiniCompletionResult) => void }>();
  const pendingLlm = new Map<string, { resolve: (r: MsgLlmQueryResult) => void }>();

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
    provider: modelProvider,
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
      log.error(`exited with code ${code}\n${stderrBuffer.join('')}`);
    }
  });

  const isApi = req.auth.type === 'api';
  const apiAuth = req.auth.type === 'api' ? req.auth : undefined;
  const baseUrl = apiAuth?.baseUrl;

  // For custom endpoints, derive protocol + capabilities from the connection
  // meta and the model the turn actually uses. Local Ollama needs the qwen
  // enable_thinking hack; remote OpenAI-compatible providers don't.
  let customEndpoint: MsgInit['customEndpoint'];
  if (isApi) {
    const meta = listConnections().find((c) => c.slug === req.connectionSlug);
    const modelDef = meta?.models.find((m) => m.id === req.model);
    const isOpenAICompat = req.auth.provider !== 'local';
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
  const runtimeAuth: MsgInit['auth'] =
    req.auth.type === 'api'
      ? {
          provider: 'openai',
          credential: { type: 'api_key', key: req.auth.apiKey ?? 'local' },
        }
      : {
          provider: req.auth.provider,
          credential: {
            type: 'oauth',
            access: req.auth.accessToken,
            refresh: req.auth.refreshToken ?? '',
            expires: req.auth.expiresAt,
          },
        };

  const init: MsgInit = {
    type: 'init',
    sessionId: req.chatSessionId,
    sessionPath: req.chatSessionPath,
    cwd: req.cwd ?? app.getPath('home'),
    model: req.model,
    visionSupported: resolveVisionSupported(req.connectionSlug, req.model),
    thinkingLevel: req.thinkingLevel ?? 'medium',
    auth: runtimeAuth,
    ...(baseUrl ? { baseUrl, customEndpoint } : {}),
    permissionMode: (req.permissionMode ?? 'auto') as MsgInit['permissionMode'],
    autonomyLevel: req.autonomyLevel,
    systemPrompt,
    availableAgents: loadAllAgents().map((a) => ({
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

export function shutdownAllChatSubprocesses(): void {
  for (const handle of handles.values()) killSubprocess(handle);
  handles.clear();
}
