// Main-process Pi backend.
//
// Owns the per-chat-session subprocess that runs `@mariozechner/pi-coding-agent`.
// Bridges JSONL events to the AgentChatEvent stream and round-trips the
// permission gate, OAuth refresh, and mini-completion RPCs with main.
//
// Lifecycle:
//   1. First chat turn lazy-spawns `out/main/pi-server.js` under node
//   2. Sends `init` with credential + system prompt + initial mode
//   3. Awaits `ready`
//   4. Sends `prompt`; forwards `event` messages until `turn_done`/`error`
//   5. On window close / app quit / abort: sends `shutdown` then SIGKILL fallback
//
// Permission gate:
//   Each non-readonly tool call by Pi triggers a `pre_tool_use_request`.
//   We resolve it via the same renderer-side permission UI used by the
//   Anthropic backend — same allow-once / allow-session / deny semantics.
//
// Token refresh:
//   When the subprocess detects an auth failure (typed `auth_required`),
//   we call `auth/resolve.ts` (which already mutexes), push the fresh
//   credential via `token_update`, and emit a typed expired_oauth_token
//   error so the UI offers a one-click retry.

import {type ChildProcess, spawn} from 'node:child_process';
import {resolveExtensionEnv} from '../../../extensions/env-resolver';
import {createInterface, type Interface as ReadlineInterface} from 'node:readline';
import {app} from 'electron';
import {join} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import type {StoredAttachment} from '../../../storage/sessions';
import {updateSessionMeta} from '../../../storage/sessions';
import type {AgentChatEvent} from '../../events';
import {parseError} from '../../errors';
import {buildPromptPrefix, buildSystemPromptAppend,} from '../../system-prompt';
import type {PermissionMode} from '../../permissions';
import type {CopilotOAuthAuth} from '../types';
import {decidePiPermission, type PiPermissionDecisionArgs,} from './permission-bridge';
import {resolveAuthForSlug} from '../../../auth/resolve';
import type {
  MsgAuthRequired,
  MsgEvent,
  MsgInit,
  MsgLlmQueryResult,
  MsgMiniCompletion,
  MsgMiniCompletionResult,
  MsgPreToolUseRequest,
  MsgPrompt,
  MsgSessionIdUpdate,
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

export interface PiPermissionAsk {
  (req: {
    reqId: string;
    turnId: string;
    sessionId: string;
    toolName: string;
    input: Record<string, unknown>;
  }): Promise<'allow_once' | 'allow_session' | 'deny'>;
}

export interface PiChatRequest {
  /** Connection slug — needed by the resolver for mid-session token refresh. */
  connectionSlug: string;
  auth: CopilotOAuthAuth;
  piAuthProvider: PiAuthProvider;
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
  /** Renderer-side permission prompt callback. */
  ask?: PiPermissionAsk;
  signal?: AbortSignal;
}

export interface PiMiniCompletionRequest {
  connectionSlug: string;
  auth: CopilotOAuthAuth;
  piAuthProvider: PiAuthProvider;
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
  /** turnId → permission-ask callback (mode + ask + sessionId). */
  permissionContext: Map<
    string,
    { mode: PermissionMode; ask: PiPermissionAsk; sessionId: string }
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
  /** True while a token refresh is in progress for this handle. */
  refreshing?: boolean;
}

/** Per-chat-session subprocess. */
const handles = new Map<string, SubprocessHandle>();

/* ============================================================ */
/*  Subprocess lifecycle                                         */
/* ============================================================ */

function resolvePiServerPath(): string {
  const candidates = [
    join(app.getAppPath(), 'out', 'main', 'pi-server.js'),
    join(app.getAppPath(), 'pi-server.js'),
    join(process.cwd(), 'out', 'main', 'pi-server.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `pi-server.js not found in any of:\n  ${candidates.join('\n  ')}\nRun \`npm run build\` so electron-vite emits the subprocess bundle.`,
  );
}

function send(handle: SubprocessHandle, msg: SubprocessInbound): void {
  if (!handle.child.stdin || handle.child.stdin.destroyed) return;
  handle.child.stdin.write(JSON.stringify(msg) + '\n');
}

function ensureSubprocess(
  req: PiChatRequest,
  systemPrompt: string,
): SubprocessHandle {
  const key = req.chatSessionPath;
  const existing = handles.get(key);
  if (existing && !existing.child.killed) return existing;

  const piServer = resolvePiServerPath();
  const child = spawn(process.execPath, [piServer], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Cli-bound extension env (resolved against the secret store).
      // Inherited by every Bash invocation inside pi-server via process.env.
      ...resolveExtensionEnv(),
      ELECTRON_RUN_AS_NODE: '1',
      MINIMALIST_AGENT_VERSION: app.getVersion(),
      // Verbose Pi event logging — pipe-through to console.error so we can
      // see what the runtime actually emits. Set PI_DEBUG=0 to silence.
      PI_DEBUG: process.env.PI_DEBUG ?? '1',
    },
  });

  const stderrBuffer: string[] = [];
  child.stderr?.setEncoding('utf-8');
  child.stderr?.on('data', (chunk: string) => {
    stderrBuffer.push(chunk);
    if (stderrBuffer.length > 50) stderrBuffer.shift();
    console.error('[pi-server stderr]', chunk.trim());
  });

  const queues = new Map<string, EventQueue>();
  const permissionContext = new Map<
    string,
    { mode: PermissionMode; ask: PiPermissionAsk; sessionId: string }
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
  };

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: SubprocessOutbound;
    try {
      msg = JSON.parse(line) as SubprocessOutbound;
    } catch {
      console.error('[pi-server] bad JSONL:', line.slice(0, 200));
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
    handles.delete(key);
    if (code !== 0 && code !== null) {
      console.error(
        `[pi-server] exited with code ${code}\n${stderrBuffer.join('')}`,
      );
    }
  });

  handles.set(key, handle);

  // Send init.
  const init: MsgInit = {
    type: 'init',
    sessionId: req.chatSessionId,
    sessionPath: req.chatSessionPath,
    cwd: req.cwd ?? app.getPath('home'),
    model: req.model,
    thinkingLevel: req.thinkingLevel ?? 'medium',
    providerType: 'pi',
    authType: 'oauth',
    piAuthProvider: req.piAuthProvider,
    piAuth: {
      provider: req.piAuthProvider,
      credential: {
        type: 'oauth',
        access: req.auth.accessToken,
        refresh: req.auth.refreshToken ?? '',
        expires: req.auth.expiresAt,
      },
    },
    permissionMode: (req.permissionMode ?? 'auto') as MsgInit['permissionMode'],
    systemPrompt,
  };
  send(handle, init);

  return handle;
}

async function handleOutbound(
  msg: SubprocessOutbound,
  handle: SubprocessHandle,
  resolveReady: () => void,
  rejectReady: (e: Error) => void,
): Promise<void> {
  switch (msg.type) {
    case 'ready':
      resolveReady();
      return;

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
      const decision = await decidePiPermission({
        mode: piModeFromPermissionMode(ctx.mode),
        sessionId: ctx.sessionId,
        turnId: req.turnId,
        toolName: req.toolName,
        input: req.input,
        ask: ctx.ask as never,
      } as PiPermissionDecisionArgs);
      send(handle, {
        type: 'pre_tool_use_response',
        requestId: req.requestId,
        action: decision.action,
        reason: decision.reason,
      });
      return;
    }

    case 'session_id_update': {
      const m = msg as MsgSessionIdUpdate;
      try {
        // Persist on session meta so a fresh subprocess can resume.
        updateSessionMeta(handle.chatSessionId, {
          sdkSessionId: m.piSessionId,
        });
      } catch (e) {
        console.error('[pi-server] failed to persist piSessionId:', e);
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
            credential: {
              type: 'oauth',
              access: fresh.accessToken,
              refresh: fresh.refreshToken ?? '',
              expires: fresh.expiresAt,
            },
          };
          send(handle, upd);
        }
      } catch (e) {
        console.error('[pi-server] token refresh failed:', e);
      } finally {
        handle.refreshing = false;
      }
      // Surface to the active turn so the UI shows a retry-able error.
      if (m.turnId) {
        const q = handle.queues.get(m.turnId);
        if (q) {
          q.push({
            type: 'error',
            error: {
              code: 'expired_oauth_token',
              title: 'GitHub Copilot session expired',
              message:
                'Your Copilot token was refreshed. Re-send the message to continue.',
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

function piModeFromPermissionMode(mode: PermissionMode): 'plan' | 'ask' | 'auto' {
  return mode;
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
  // Same system-prompt assembly as the Anthropic backend.
  const append = buildSystemPromptAppend({ cwd: req.cwd, sessionId: req.chatSessionId, userMessage: req.prompt });
  const prefix = buildPromptPrefix({ cwd: req.cwd });

  let handle: SubprocessHandle;
  try {
    handle = ensureSubprocess(req, append);
    await handle.ready;
  } catch (e) {
    yield { type: 'error', error: parseError(e) };
    return;
  }

  // Update mode in case the user changed it between turns.
  send(handle, { type: 'set_permission_mode', mode: req.permissionMode ?? 'auto' });

  // Register permission context for this turn.
  if (req.ask) {
    handle.permissionContext.set(req.turnId, {
      mode: req.permissionMode ?? 'auto',
      ask: req.ask,
      sessionId: req.chatSessionId,
    });
  }

  const queue = new EventQueue();
  handle.queues.set(req.turnId, queue);

  const finalPrompt = prefix ? `${prefix}\n\n${req.prompt}` : req.prompt;
  const promptMsg: MsgPrompt = {
    type: 'prompt',
    turnId: req.turnId,
    message: buildPiPrompt(finalPrompt, req.attachments),
    images: buildImages(req.attachments),
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
  let handle: SubprocessHandle;
  try {
    handle = ensureSubprocess(piReq, '');
    await handle.ready;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

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
  return { text: result.text, error: result.error };
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
  send(handle, { type: 'steer', turnId: args.turnId, message: args.message });
  return true;
}

/* ============================================================ */
/*  Cleanup                                                       */
/* ============================================================ */

export function shutdownAllPiSubprocesses(): void {
  for (const handle of handles.values()) {
    try { send(handle, { type: 'shutdown' }); } catch { /* */ }
    setTimeout(() => {
      if (!handle.child.killed) {
        try { handle.child.kill('SIGKILL'); } catch { /* */ }
      }
    }, 1000);
  }
  handles.clear();
}
