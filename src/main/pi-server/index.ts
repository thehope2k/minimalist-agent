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
  ModelRegistry,
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
import { createPiAgentTool } from '../agent/backends/pi/agent-tool';
import { KNOWN_MODEL_IDS } from '../../shared/agent-models';
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
  PiAuthProvider,
  PiPermissionMode,
  PiThinkingLevel,
  SubprocessInbound,
  SubprocessOutbound,
} from '../agent/backends/pi/protocol';
import { fileURLToPath } from 'node:url';
import type { LoadedAgent } from '../agents/types';

// Derive the path to this pi-server bundle for spawning agent subprocesses
const PI_SERVER_PATH = fileURLToPath(import.meta.url);

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

function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}

/* ============================================================ */
/*  Per-process state                                            */
/* ============================================================ */

interface State {
  init?: MsgInit;
  authStorage?: AuthStorage;
  session?: AgentSession;
  resourceLoader?: DefaultResourceLoader;
  /** Available agents passed from main process. */
  availableAgents: LoadedAgent[];
  /** Mutable array passed by reference into resourceLoader — update in-place
   *  before reload() so per-turn SDD context takes effect without recreating
   *  the session. */
  appendArr: string[];
  /** Last value pushed into appendArr — avoids a redundant reload(). */
  lastAppend?: string;
  model?: ReturnType<typeof getModel>;
  permissionMode: PiPermissionMode;
  currentTurnId?: string;
  unsubscribe?: () => void;
  pendingPermission: Map<
    string,
    { resolve: (r: MsgPreToolUseResponse) => void }
  >;
  turnAbort?: AbortController;
  shuttingDown?: boolean;
}

const state: State = {
  permissionMode: 'auto',
  pendingPermission: new Map(),
  appendArr: [],
  availableAgents: [],
};

/**
 * Tracks the live `session.prompt()` promise so that a new prompt message
 * arriving while the previous one is still in its resolution tail (after the
 * terminal subscription event fired but before the promise settled) can wait
 * instead of calling `session.prompt()` concurrently and hitting the
 * "Agent is already processing" error from the Pi SDK.
 */
let activePromptPromise: Promise<void> | null = null;

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

function buildWrappedTools(
  cwd: string,
  agentContext?: {
    sessionId: string;
    sessionPath: string;
    piServerPath: string;
    availableAgents: LoadedAgent[];
    piAuthProvider: string; // Will be validated as PiAuthProvider at runtime
    sessionModel: string; // Parent session's model for agent resolution
    getAuth: () => Promise<{ access: string; refresh?: string; expires?: number }>;
    baseUrl?: string;
    customEndpoint?: { api: 'openai-completions' | 'anthropic-messages'; supportsImages?: boolean };
    permissionMode: 'plan' | 'ask' | 'auto';
  },
): ToolDefinition<any, any, any>[] {
  const tools: ToolDefinition<any, any, any>[] = [
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

  // Add Agent tool if we have the necessary context
  if (agentContext) {
    tools.push(wrapWithPermissionGate(createPiAgentTool({
      ...agentContext,
      piAuthProvider: agentContext.piAuthProvider as PiAuthProvider,
      cwd,
    })));
  }

  return tools;
}

/* ============================================================ */
/*  init                                                          */
/* ============================================================ */

async function handleInit(msg: MsgInit): Promise<void> {
  state.init = msg;
  state.permissionMode = msg.permissionMode;
  state.appendArr = msg.systemPrompt ? [msg.systemPrompt] : [];
  state.lastAppend = msg.systemPrompt ?? '';

  // Store available agents (passed from main process)
  state.availableAgents = (msg.availableAgents || []).map(a => ({
    slug: a.slug,
    metadata: a.metadata,
    content: a.content,
    path: a.path,
    iconPath: a.iconPath,
  }));

  const authStorage = AuthStorage.inMemory();
  if (msg.piAuth) {
    await writeAuthCredential(authStorage, msg.piAuthProvider, msg.piAuth.credential);
  }
  state.authStorage = authStorage;

  const hasCustomEndpoint = !!msg.baseUrl?.trim() && !!msg.customEndpoint;

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  let model: ReturnType<typeof getModel>;
  if (hasCustomEndpoint) {
    const modelId = msg.model;
    const rawBase = msg.baseUrl!.trim();
    // The openai-completions provider passes baseUrl directly to the OpenAI
    // SDK client which appends /chat/completions — so the URL must include
    // /v1. Append it automatically so users can type http://localhost:11434.
    const apiBase = msg.customEndpoint!.api === 'openai-completions' && !rawBase.endsWith('/v1')
      ? `${rawBase}/v1`
      : rawBase;
    // Localhost endpoints (Ollama, LM Studio) don’t need auth.
    const apiKey = isLocalhostUrl(rawBase) ? 'not-needed' : (msg.piAuth?.credential.type === 'api_key' ? msg.piAuth.credential.key : '');
    modelRegistry.registerProvider('custom-endpoint', {
      baseUrl: apiBase,
      apiKey,
      api: msg.customEndpoint!.api,
      authHeader: true,
      models: [{
        id: modelId,
        name: modelId,
        // Mark reasoning=true + thinkingFormat='qwen' so the Pi SDK explicitly
        // sends enable_thinking:false when no reasoningEffort is set.
        // Without this, Ollama defaults to thinking-on for Qwen3 models
        // causing ~30s delay before the first token.
        reasoning: true,
        compat: { thinkingFormat: 'qwen' },
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131_072,
        maxTokens: 8_192,
      }],
    } as never);
    const resolved = (modelRegistry as unknown as { find: (p: string, id: string) => ReturnType<typeof getModel> | undefined })
      .find('custom-endpoint', modelId);
    if (!resolved) fatal(`Could not resolve custom-endpoint model: ${modelId}`);
    model = resolved!;
  } else {
    // Resolve the Pi model. The cast to `never` for the model id is
    // necessary because Pi's getModel<TProvider, TModelId> signature uses
    // a typed lookup; we pass model ids dynamically.
    model = getModel(msg.piAuthProvider as 'github-copilot', msg.model as never);
    
    // Validate that the model resolved successfully
    if (!model) {
      // Show common models as examples
      const exampleModels = 'gpt-5.5, gpt-5.4, claude-opus-4.7, claude-sonnet-4.6, gemini-3.5-flash';
      
      fatal(
        `Failed to resolve model "${msg.model}" for provider "${msg.piAuthProvider}". ` +
        `This usually means the model ID is invalid or not supported by this provider. ` +
        `Common models: ${exampleModels}. ` +
        `You can also use "session-default" to inherit the session model. ` +
        `Check your connection settings or agent configuration.`
      );
    }

    // CRITICAL for github-copilot: the OAuth access token carries a
    // `proxy-ep=` claim that pins requests to the user's regional API
    // host. Without applying it the request hits a default endpoint that
    // doesn't serve the model → 421 Misdirected Request.
    const provider = getOAuthProvider(msg.piAuthProvider);
    if (provider?.modifyModels && msg.piAuth?.credential.type === 'oauth') {
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
  }
  state.model = model;

  // continueRecent resumes the most recent session stored in msg.sessionPath
  // (our userData-backed dir), or creates a new one if none exists yet.
  const sessionManager = SessionManager.continueRecent(msg.cwd, msg.sessionPath);

  // Build agent context for the Agent tool
  const agentContext = {
    sessionId: msg.sessionId,
    sessionPath: msg.sessionPath,
    piServerPath: PI_SERVER_PATH,
    availableAgents: state.availableAgents,
    piAuthProvider: msg.piAuthProvider,
    sessionModel: msg.model,  // Pass parent model for session-default resolution
    getAuth: async () => {
      if (!state.authStorage) {
        throw new Error('Auth storage not initialized');
      }
      const apiKey = await state.authStorage.getApiKey(msg.piAuthProvider);
      const cred = state.authStorage.get(msg.piAuthProvider);
      if (cred?.type === 'oauth') {
        return {
          access: cred.access,
          refresh: cred.refresh,
          expires: cred.expires,
        };
      }
      return { access: apiKey || '' };
    },
    ...(hasCustomEndpoint ? {
      baseUrl: msg.baseUrl,
      customEndpoint: msg.customEndpoint,
    } : {}),
    permissionMode: msg.permissionMode as 'plan' | 'ask' | 'auto',
  };

  const tools = buildWrappedTools(msg.cwd, agentContext);

  const agentDir = join(homedir(), '.pi', 'agent');
  const resourceLoader = new DefaultResourceLoader({
    cwd: msg.cwd,
    agentDir,
    appendSystemPrompt: state.appendArr,
  });
  await resourceLoader.reload();
  state.resourceLoader = resourceLoader;

  const { session } = await createAgentSession({
    cwd: msg.cwd,
    model,
    // Local models are slow enough without extended thinking.
    // Force minimal for custom endpoints; honour the user's setting otherwise.
    thinkingLevel: hasCustomEndpoint ? 'minimal' : mapThinkingLevel(msg.thinkingLevel),
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader,
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

  if (activePromptPromise) {
    await activePromptPromise;
  }

  // Update the system-prompt append when it has changed (per-turn SDD context).
  const newAppend = msg.systemPromptAppend ?? '';
  if (newAppend !== state.lastAppend && state.resourceLoader) {
    state.appendArr.length = 0;
    if (newAppend) state.appendArr.push(newAppend);
    state.lastAppend = newAppend;
    await state.resourceLoader.reload();
  }

  state.currentTurnId = msg.turnId;
  state.turnAbort = new AbortController();

  const run = async (): Promise<void> => {
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
        // forwardEvent hasn't cleared currentTurnId yet — the turn wasn't
        // acknowledged via a subscription event, so we must emit the error.
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
        // forwardEvent already emitted a terminal event and cleared
        // currentTurnId. The error is a duplicate from the promise
        // resolution tail — log it but don't fatal, the turn is already
        // handled on main's side.
        console.error('[pi-server] session.prompt() threw after terminal event:', message);
      }
    }
  };

  activePromptPromise = run();
  try {
    await activePromptPromise;
  } finally {
    activePromptPromise = null;
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
    
    // Validate model resolved successfully
    if (msg.model && !model) {
      sendMiniError(
        msg.requestId,
        `Failed to resolve model "${msg.model}" for provider "${state.init.piAuthProvider}". ` +
        `Use a valid model ID or omit the model parameter to use the default.`
      );
      return;
    }
    
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
    
    // Validate model resolved successfully
    if (req.model && !model) {
      const out: MsgLlmQueryResult = {
        type: 'llm_query_result',
        requestId: msg.requestId,
        error: `Failed to resolve model "${req.model}" for provider "${state.init.piAuthProvider}".`,
      };
      send(out);
      return;
    }
    
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
      if (state.init) {
        try {
          let newModel = getModel(
            state.init.piAuthProvider as 'github-copilot',
            msg.model as never,
          );
          
          // Validate model resolved successfully
          if (!newModel) {
            console.error(
              `[pi-server] Failed to resolve model "${msg.model}" for provider "${state.init.piAuthProvider}". ` +
              `Model change ignored.`
            );
            return;
          }
          
          // Apply modifyModels for providers that pin a regional endpoint
          // (e.g. github-copilot proxy-ep claim).
          const provider = getOAuthProvider(state.init.piAuthProvider);
          const cred = state.authStorage?.get(state.init.piAuthProvider);
          if (provider?.modifyModels && cred?.type === 'oauth') {
            const [adjusted] = provider.modifyModels([newModel] as never, cred as never);
            if (adjusted) newModel = adjusted as typeof newModel;
          }
          state.model = newModel;
          // Propagate to the live session so the next prompt uses the new model.
          if (state.session) {
            await state.session.setModel(newModel as never);
          }
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
