// Pi subprocess server — runs `@mariozechner/pi-coding-agent`'s
// AgentSession in-process and bridges it to the main process via JSONL
// over stdin/stdout.
//
// Built as a SECOND main-process bundle (see `electron.vite.config.ts`)
// and spawned by `agent/backends/pi/agent.ts` per chat session.
//
// Responsibilities:
//   - Boot a Pi AgentSession with the user's chosen model + system prompt
//   - Stream Pi events back as adapted `AgentChatEvent`s (in-process adapter)
//   - Permission-gate every non-readonly tool by round-tripping
//     `pre_tool_use_request` / `pre_tool_use_response` with main
//   - Surface auth failures as `auth_required` so main can refresh the
//     OAuth token and push it back via `token_update` without restart
//   - Handle one-shot `mini_completion` (title gen / cheap completions)
//     and `llm_query` (call_llm tool backend) without the agent loop
//
// All state lives in the `state` object below — there's exactly one
// AgentSession per subprocess, and one subprocess per chat session.

import { createInterface } from 'node:readline';
import {
  createAgentSession,
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getModel, completeSimple, type ThinkingLevel } from '@mariozechner/pi-ai';
import { getOAuthProvider } from '@mariozechner/pi-ai/oauth';
import { adaptPiEvent } from './event-adapter';
import { createPiWebFetchTool, createPiWebSearchTool } from './web-tools';
import type {
  MsgAuthRequired,
  MsgEvent,
  MsgFatalError,
  MsgInit,
  MsgLlmQuery,
  MsgLlmQueryResult,
  MsgMiniCompletion,
  MsgMiniCompletionResult,
  MsgPreToolUseRequest,
  MsgPreToolUseResponse,
  MsgPrompt,
  MsgReady,
  MsgSessionIdUpdate,
  MsgTokenUpdate,
  PiPermissionMode,
  PiThinkingLevel,
  SubprocessInbound,
  SubprocessOutbound,
} from '../agent/backends/pi/protocol';

/* ============================================================ */
/*  stdio framing                                                */
/* ============================================================ */

function send(msg: SubprocessOutbound): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function fatal(message: string): never {
  const m: MsgFatalError = { type: 'error', message };
  send(m);
  process.exit(1);
}

/* ============================================================ */
/*  Per-process state                                            */
/* ============================================================ */

interface State {
  init?: MsgInit;
  authStorage?: AuthStorage;
  session?: AgentSession;
  model?: ReturnType<typeof getModel>;
  /** Current permission mode — flippable mid-session via set_permission_mode. */
  permissionMode: PiPermissionMode;
  /** turnId of the in-flight prompt. */
  currentTurnId?: string;
  /** unsubscribe fn returned by session.subscribe(). */
  unsubscribe?: () => void;
  /** Pending pre-tool-use round trips, keyed by requestId. */
  pendingPermission: Map<
    string,
    { resolve: (r: MsgPreToolUseResponse) => void }
  >;
  /** AbortController for the active turn — lets us cancel tool waits. */
  turnAbort?: AbortController;
  shuttingDown?: boolean;
}

const state: State = {
  permissionMode: 'auto',
  pendingPermission: new Map(),
};

/* ============================================================ */
/*  Thinking-level mapping                                       */
/* ============================================================ */

/** Our protocol's level → Pi's accepted set ('minimal'..'xhigh').
 *  'off' has no Pi equivalent → 'minimal'. 'max' clamps to 'xhigh'. */
function mapThinkingLevel(level: PiThinkingLevel): ThinkingLevel {
  if (level === 'off') return 'minimal';
  if (level === 'max') return 'xhigh';
  return level;
}

/* ============================================================ */
/*  Auth storage seeding + refresh                               */
/* ============================================================ */

async function writeAuthCredential(
  authStorage: AuthStorage,
  provider: string,
  cred: MsgInit['piAuth']['credential'] | MsgTokenUpdate['credential'],
): Promise<void> {
  if (cred.type === 'oauth') {
    await authStorage.set(provider, {
      type: 'oauth',
      access: cred.access,
      refresh: cred.refresh,
      expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
    } as never);
  } else {
    await authStorage.set(provider, {
      type: 'api_key',
      key: cred.key,
    } as never);
  }
}

/* ============================================================ */
/*  Tool wrappers — permission gate                              */
/* ============================================================ */

const READ_ONLY_TOOL_NAMES = new Set([
  'read',
  'grep',
  'find',
  'ls',
  'web_fetch',
  'web_search',
]);

/**
 * Wrap a Pi tool definition so its `execute` first asks main for
 * permission via `pre_tool_use_request`. Read-only tools are exempt
 * from the round-trip in `auto` mode (the gate adds latency for nothing).
 */
function wrapWithPermissionGate(
  base: ToolDefinition<any, any, any>,
): ToolDefinition<any, any, any> {
  const originalExecute = base.execute.bind(base);
  return {
    ...base,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Auto + readonly = fast path. Auto + write = also auto-allow but
      // still emit the request so main can record what happened. We
      // skip the round-trip entirely for a pure latency win.
      if (state.permissionMode === 'auto') {
        return originalExecute(toolCallId, params, signal, onUpdate, ctx);
      }

      // Read-only tools always pass even in plan/ask.
      if (READ_ONLY_TOOL_NAMES.has(base.name.toLowerCase())) {
        return originalExecute(toolCallId, params, signal, onUpdate, ctx);
      }

      const decision = await requestPermission(toolCallId, base.name, params);

      if (decision.action === 'block') {
        // IMPORTANT: Pi's agent-loop only flags `isError: true` on the
        // tool_execution_end event when execute() *throws*. Returning
        // `{ isError: true, content: [...] }` is silently treated as
        // success — the UI then draws a green check on a tool call that
        // never actually ran (e.g. plan-mode-blocked Edit). Throwing
        // routes us through the agent-loop's error path so isError flows
        // through to tool_execution_end → tool_result → DiffPart.
        throw new Error(decision.reason ?? 'Tool execution denied.');
      }

      const finalParams = decision.action === 'modify' ? decision.input : params;
      return originalExecute(toolCallId, finalParams, signal, onUpdate, ctx);
    },
  };
}

function requestPermission(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Promise<MsgPreToolUseResponse> {
  return new Promise((resolve) => {
    const requestId = `pi_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingPermission.set(requestId, { resolve });

    const turnId = state.currentTurnId ?? '';
    const req: MsgPreToolUseRequest = {
      type: 'pre_tool_use_request',
      requestId,
      turnId,
      toolCallId,
      toolName,
      input,
    };
    send(req);

    // If the turn is aborted before main responds, auto-block so the
    // tool throws instead of hanging.
    state.turnAbort?.signal.addEventListener('abort', () => {
      const pending = state.pendingPermission.get(requestId);
      if (pending) {
        state.pendingPermission.delete(requestId);
        pending.resolve({
          type: 'pre_tool_use_response',
          requestId,
          action: 'block',
          reason: 'Turn aborted',
        });
      }
    });
  });
}

function buildWrappedTools(cwd: string): ToolDefinition<any, any, any>[] {
  return [
    wrapWithPermissionGate(createReadToolDefinition(cwd)),
    wrapWithPermissionGate(createBashToolDefinition(cwd)),
    wrapWithPermissionGate(createEditToolDefinition(cwd)),
    wrapWithPermissionGate(createWriteToolDefinition(cwd)),
    wrapWithPermissionGate(createGrepToolDefinition(cwd)),
    wrapWithPermissionGate(createFindToolDefinition(cwd)),
    wrapWithPermissionGate(createLsToolDefinition(cwd)),
    // Web tools — read-only, but still routed through the permission
    // gate so plan/ask modes stay in control.
    wrapWithPermissionGate(createPiWebFetchTool()),
    wrapWithPermissionGate(createPiWebSearchTool()),
  ];
}

/* ============================================================ */
/*  init                                                          */
/* ============================================================ */

async function handleInit(msg: MsgInit): Promise<void> {
  state.init = msg;
  state.permissionMode = msg.permissionMode;

  const authStorage = AuthStorage.inMemory();
  await writeAuthCredential(authStorage, msg.piAuthProvider, msg.piAuth.credential);
  state.authStorage = authStorage;

  // Resolve the Pi model. The cast to `never` for the model id is
  // necessary because Pi's getModel<TProvider, TModelId> signature uses
  // a typed lookup; we pass model ids dynamically.
  let model = getModel(msg.piAuthProvider as 'github-copilot', msg.model as never);

  // CRITICAL for github-copilot: the OAuth access token carries a
  // `proxy-ep=` claim that pins requests to the user's regional API
  // host. Without applying it the request hits a default endpoint that
  // doesn't serve the model → 421 Misdirected Request. The OAuth
  // provider's `modifyModels` hook resolves the right baseUrl from the
  // current credential.
  const provider = getOAuthProvider(msg.piAuthProvider);
  if (provider?.modifyModels && msg.piAuth.credential.type === 'oauth') {
    const cred = msg.piAuth.credential;
    const [adjusted] = provider.modifyModels(
      [model] as never,
      {
        access: cred.access,
        refresh: cred.refresh,
        expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
      } as never,
    );
    if (adjusted) model = adjusted as typeof model;
  }
  state.model = model;

  const sessionManager = SessionManager.create(msg.sessionPath);

  const tools = buildWrappedTools(msg.cwd);

  const agentDir = join(homedir(), '.pi', 'agent');
  const resourceLoader = new DefaultResourceLoader({
    cwd: msg.cwd,
    agentDir,
    appendSystemPrompt: msg.systemPrompt ? [msg.systemPrompt] : [],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: msg.cwd,
    model,
    thinkingLevel: mapThinkingLevel(msg.thinkingLevel),
    authStorage,
    sessionManager,
    resourceLoader,
    // Replace Pi's default built-ins with our permission-gated wrappers.
    noTools: 'builtin',
    customTools: tools as never,
  });
  state.session = session;
  state.unsubscribe = session.subscribe(forwardEvent);

  const ready: MsgReady = {
    type: 'ready',
    piSessionId: session.sessionId ?? null,
  };
  send(ready);
}

/* ============================================================ */
/*  Event forwarding                                              */
/* ============================================================ */

function forwardEvent(piEvent: AgentSessionEvent): void {
  if (!state.currentTurnId) return;

  const t = (piEvent as { type?: string }).type;

  if (t === 'session_info_changed') {
    const id = state.session?.sessionId;
    if (id) {
      const u: MsgSessionIdUpdate = { type: 'session_id_update', piSessionId: id };
      send(u);
    }
    return;
  }

  // Detect auth-required errors *before* the generic adapter so main can
  // refresh the token. We still let the adapter emit the user-visible
  // error so the UI knows the turn failed.
  if (t === 'message_end' || t === 'agent_end' || t === 'turn_end') {
    const msg = (piEvent as { message?: unknown }).message as
      | { stopReason?: string; errorMessage?: string }
      | undefined;
    if (msg && (msg.stopReason === 'error' || msg.errorMessage)) {
      const text = `${msg.errorMessage ?? ''}`.toLowerCase();
      if (
        text.includes('401') ||
        text.includes('unauthorized') ||
        text.includes('expired') ||
        text.includes('invalid_token')
      ) {
        const out: MsgAuthRequired = {
          type: 'auth_required',
          turnId: state.currentTurnId,
          message: msg.errorMessage ?? 'Auth failed',
        };
        send(out);
      }
    }
  }

  const turnId = state.currentTurnId;
  const adapted = adaptPiEvent(piEvent);
  for (const ev of adapted) {
    const out: MsgEvent = { type: 'event', turnId, event: ev };
    send(out);
    if (ev.type === 'turn_done' || ev.type === 'error') {
      state.currentTurnId = undefined;
      state.turnAbort = undefined;
    }
  }
}

/* ============================================================ */
/*  prompt                                                        */
/* ============================================================ */

async function handlePrompt(msg: MsgPrompt): Promise<void> {
  if (!state.session) fatal('Received prompt before init');

  state.currentTurnId = msg.turnId;
  state.turnAbort = new AbortController();
  try {
    await state.session!.prompt(msg.message, {
      images: msg.images?.map((i) => ({
        mimeType: i.mimeType,
        data: i.data,
      })) as never,
    });
    // Terminal events emit through forwardEvent; nothing else to do here.
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (state.currentTurnId) {
      const out: MsgEvent = {
        type: 'event',
        turnId: state.currentTurnId,
        event: {
          type: 'error',
          error: {
            code: 'unknown_error',
            title: 'Pi runtime error',
            message,
            canRetry: false,
            originalError: message,
          },
        },
      };
      send(out);
      state.currentTurnId = undefined;
      state.turnAbort = undefined;
    } else {
      fatal(message);
    }
  }
}

/* ============================================================ */
/*  mini_completion + llm_query                                   */
/* ============================================================ */

async function handleMiniCompletion(msg: MsgMiniCompletion): Promise<void> {
  if (!state.init) {
    sendMiniError(msg.requestId, 'Subprocess not initialized.');
    return;
  }
  try {
    let model = msg.model
      ? getModel(state.init.piAuthProvider as 'github-copilot', msg.model as never)
      : state.model!;
    // CRITICAL for github-copilot: a freshly-resolved model is not yet
    // pinned to the user's regional API host (the `proxy-ep=` claim in the
    // OAuth token). Without modifyModels we hit the default endpoint and
    // get 421 Misdirected Request. state.model was already adjusted at
    // init; only need to re-apply when we resolved a different one.
    if (msg.model) {
      const provider = getOAuthProvider(state.init.piAuthProvider);
      const cred = state.authStorage?.get(state.init.piAuthProvider);
      if (provider?.modifyModels && cred?.type === 'oauth') {
        const [adjusted] = provider.modifyModels(
          [model] as never,
          {
            access: cred.access,
            refresh: cred.refresh,
            expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
          } as never,
        );
        if (adjusted) model = adjusted as typeof model;
      }
    }
    // completeSimple does NOT consult authStorage on its own — we have to
    // hand it the resolved key. authStorage.getApiKey refreshes the OAuth
    // token transparently if it's expired.
    const apiKey = state.authStorage
      ? await state.authStorage.getApiKey(state.init.piAuthProvider)
      : undefined;
    const options: Record<string, unknown> = {};
    if (apiKey) options.apiKey = apiKey;
    if (msg.maxTokens !== undefined) options.maxTokens = msg.maxTokens;
    const result = await completeSimple(
      model,
      {
        systemPrompt: msg.systemPrompt,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: msg.userPrompt }],
          },
        ],
        tools: [],
      } as never,
      Object.keys(options).length > 0 ? (options as never) : undefined,
    );

    // Pull plain text out of the assistant message.
    const text = pickTextFromMessage(result);
    const out: MsgMiniCompletionResult = {
      type: 'mini_completion_result',
      requestId: msg.requestId,
      text,
    };
    send(out);
  } catch (e) {
    sendMiniError(msg.requestId, e instanceof Error ? e.message : String(e));
  }
}

function sendMiniError(requestId: string, error: string): void {
  const out: MsgMiniCompletionResult = {
    type: 'mini_completion_result',
    requestId,
    error,
  };
  send(out);
}

async function handleLlmQuery(msg: MsgLlmQuery): Promise<void> {
  // Pass-through: caller serialises a Pi-shaped Context request, we run
  // it via completeSimple, return the AssistantMessage. Wraps the
  // call_llm tool's main-side handler.
  if (!state.init || !state.model) {
    const out: MsgLlmQueryResult = {
      type: 'llm_query_result',
      requestId: msg.requestId,
      error: 'Subprocess not initialized.',
    };
    send(out);
    return;
  }
  try {
    const req = msg.request as {
      systemPrompt?: string;
      userPrompt: string;
      model?: string;
      tools?: never[];
    };
    const model = req.model
      ? getModel(state.init.piAuthProvider as 'github-copilot', req.model as never)
      : state.model;
    const result = await completeSimple(model, {
      systemPrompt: req.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: req.userPrompt }],
        },
      ],
      tools: req.tools ?? [],
    } as never);
    const out: MsgLlmQueryResult = {
      type: 'llm_query_result',
      requestId: msg.requestId,
      result: { text: pickTextFromMessage(result) },
    };
    send(out);
  } catch (e) {
    const out: MsgLlmQueryResult = {
      type: 'llm_query_result',
      requestId: msg.requestId,
      error: e instanceof Error ? e.message : String(e),
    };
    send(out);
  }
}

function pickTextFromMessage(message: unknown): string {
  const m = message as {
    content?: Array<{ type?: string; text?: string; content?: unknown }>;
    text?: string;
  };
  if (!m) return '';
  // Top-level text field (some providers flatten to a single string).
  if (typeof m.text === 'string' && m.text.length > 0) return m.text;
  if (!m.content) return '';
  // Pull text from any block that exposes a string `text` field — covers
  // 'text' blocks, 'output_text' blocks, and providers that don't tag the
  // type at all but include a `.text` property.
  const out = m.content
    .filter((b) => b && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (out.length > 0) return out;
  // Last-ditch: some providers wrap text in a nested `content` array.
  for (const b of m.content) {
    if (b && Array.isArray((b as { content?: unknown }).content)) {
      const inner = pickTextFromMessage(b);
      if (inner) return inner;
    }
  }
  return '';
}

/* ============================================================ */
/*  Dispatch                                                      */
/* ============================================================ */

async function dispatch(msg: SubprocessInbound): Promise<void> {
  switch (msg.type) {
    case 'init':
      await handleInit(msg);
      return;

    case 'prompt':
      await handlePrompt(msg);
      return;

    case 'set_model':
      // AgentSession exposes setModel via session-event; we resolve a
      // fresh model handle and let Pi pick it up on the next turn.
      if (state.init) {
        try {
          state.model = getModel(
            state.init.piAuthProvider as 'github-copilot',
            msg.model as never,
          );
        } catch (e) {
          console.error('[pi-server] set_model failed:', e);
        }
      }
      return;

    case 'set_thinking_level':
      // Pi clamps internally; nothing we can push without recreating
      // the session. Stored for future turns.
      if (state.init) state.init.thinkingLevel = msg.level;
      return;

    case 'set_permission_mode':
      state.permissionMode = msg.mode;
      return;

    case 'token_update':
      if (state.authStorage && state.init) {
        await writeAuthCredential(
          state.authStorage,
          state.init.piAuthProvider,
          msg.credential,
        );
        // Refresh the model's baseUrl from the new access token's
        // proxy-ep claim; expired tokens may rotate to a different host.
        if (state.model && msg.credential.type === 'oauth') {
          const provider = getOAuthProvider(state.init.piAuthProvider);
          if (provider?.modifyModels) {
            const cred = msg.credential;
            const [adjusted] = provider.modifyModels(
              [state.model] as never,
              {
                access: cred.access,
                refresh: cred.refresh,
                expires: cred.expires ?? Date.now() + 30 * 60 * 1000,
              } as never,
            );
            if (adjusted) state.model = adjusted as typeof state.model;
          }
        }
      }
      return;

    case 'abort':
      try { state.session?.abort(); } catch { /* */ }
      state.turnAbort?.abort();
      return;

    case 'pre_tool_use_response': {
      const pending = state.pendingPermission.get(msg.requestId);
      if (!pending) return;
      state.pendingPermission.delete(msg.requestId);
      pending.resolve(msg);
      return;
    }

    case 'steer': {
      // Inject a user message into the in-flight turn. Pi's AgentSession
      // exposes streamingBehavior: 'steer' which interrupts the model
      // mid-step and re-prompts with the combined context.
      if (!state.session) return;
      try {
        await state.session.prompt(msg.message, {
          streamingBehavior: 'steer',
        } as never);
      } catch (e) {
        console.error('[pi-server] steer failed:', e);
      }
      return;
    }

    case 'mini_completion':
      await handleMiniCompletion(msg);
      return;

    case 'llm_query':
      await handleLlmQuery(msg);
      return;

    case 'shutdown':
      state.shuttingDown = true;
      try { state.unsubscribe?.(); } catch { /* */ }
      try { state.session?.dispose(); } catch { /* */ }
      process.exit(0);
  }
}

/* ============================================================ */
/*  Entrypoint                                                    */
/* ============================================================ */

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let parsed: SubprocessInbound;
  try {
    parsed = JSON.parse(line) as SubprocessInbound;
  } catch (e) {
    fatal(`Bad JSONL on stdin: ${e instanceof Error ? e.message : e}`);
  }
  dispatch(parsed).catch((e) => {
    const m = e instanceof Error ? e.message : String(e);
    if (state.currentTurnId) {
      const out: MsgEvent = {
        type: 'event',
        turnId: state.currentTurnId,
        event: {
          type: 'error',
          error: {
            code: 'unknown_error',
            title: 'Subprocess error',
            message: m,
            canRetry: false,
            originalError: m,
          },
        },
      };
      send(out);
      state.currentTurnId = undefined;
    } else {
      fatal(m);
    }
  });
});

rl.on('close', () => {
  if (!state.shuttingDown) process.exit(0);
});
