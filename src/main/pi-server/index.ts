// Pi subprocess server — runs `@earendil-works/pi-coding-agent`'s
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
// State is centralized in `./state.ts` (one AgentSession per subprocess, one
// subprocess per chat session) so every module here can read/write it without
// importing the whole dispatch loop.

import { createInterface } from 'node:readline';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  ModelRegistry,
  ModelRuntime,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type AgentSessionEvent,
  type ToolDefinition,
  type InlineExtension,
} from '@earendil-works/pi-coding-agent';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getBuiltinModel, builtinModels } from '@earendil-works/pi-ai/providers/all';
import type { Api, Model, OAuthCredential } from '@earendil-works/pi-ai';
import { configureHttpIdleTimeout } from './http-idle-timeout';
import { initOperationTracker, reportOperation, withOperation } from './operation-tracker';
import { AUTO_COMPACTION_TIMEOUT_MS, HTTP_IDLE_TIMEOUT_MS, MINI_COMPLETION_CEILING_MS } from '../../shared/timeouts';
import { withTimeout } from '../../shared/with-timeout';
import { send } from './transport';
import { state } from './state';
import { errMessage, delay, isTransientOAuthRefreshError, writeAuthCredential, InMemoryCredentialStore, OAUTH_REFRESH_RETRY_DELAY_MS } from './credential-store';
import { mapThinkingLevel, applyVisionInput, withResolvedBaseUrl, isLocalhostUrl } from './model-utils';
import { wrapWithPermissionGate, instrumentTool, requestBrowserTool } from './tool-wrapping';
import { createCollaborationTools, promoteToAutoAfterApproval } from './collaboration-tools';
import { createPlanningTools } from './planning-tools';
import {
  serverAddress,
  finishModelSpan,
  tracedCompletion,
  pickTextFromMessage,
  type AssistantMsg,
} from './otel-usage';

configureHttpIdleTimeout(HTTP_IDLE_TIMEOUT_MS);

/** Shared models instance for `completeSimple` calls (title gen, llm_query).
 *  Built-in provider catalog; auth is passed inline via `StreamOptions.apiKey`. */
const piModels = builtinModels();
import { adaptPiEvent } from './event-adapter';
import { createPiWebFetchTool, createPiWebSearchTool } from './web-tools';
import { createPiBrowserTool } from './browser-tool';
import { connectMcpServers, closeMcpClients } from './mcp-tools';
import { createPiAgentTool } from '../agent-runtime/backends/pi/agent-tool';
import type {
  MsgAuthRequired,
  MsgEvent,
  MsgFatalError,
  MsgInit,
  MsgLlmQuery,
  MsgLlmQueryResult,
  MsgManualCompact,
  MsgMiniCompletion,
  MsgMiniCompletionResult,
  MsgPrompt,
  MsgReady,
  MsgSessionIdUpdate,
  PiAuthProvider,
  SubprocessInbound,
} from '../agent-runtime/backends/pi/protocol';
import { fileURLToPath } from 'node:url';
import type { LoadedAgent } from '../agents/types';
import { PlanManager } from '../agent-runtime/planning/manager';
import { createLogger } from '../../shared/sub-logger';
import { resolveCompactionSettings } from '../../shared/compaction';
import {
  initOtel,
  shutdownOtel,
  startSpan,
  withSpan,
  captureContent,
  contextFromCarrier,
  isOtelEnabled,
  recordException,
  safeAttr,
  setAttrs,
  SpanKind,
  SpanStatusCode,
} from '../../shared/otel';
import { context as otelContext } from '@opentelemetry/api';

const log = createLogger('pi-server');

// Derive the path to this pi-server bundle for spawning agent subprocesses
const PI_SERVER_PATH = fileURLToPath(import.meta.url);

/* ============================================================ */
/*  stdio framing                                                */
/* ============================================================ */

initOperationTracker((operation) => send({ type: 'operation_update', operation }));

function fatal(message: string): never {
  const m: MsgFatalError = { type: 'error', message };
  send(m);
  // End any in-flight spans so the file exporter (synchronous append on span
  // end) persists them, and kick a best-effort flush for batched exporters.
  endInflightSpans('fatal');
  void shutdownOtel();
  process.exit(1);
}

/**
 * End any open model/turn spans before an abrupt exit so they aren't lost. The
 * file/console exporters flush synchronously on `span.end()`; OTLP relies on the
 * accompanying best-effort `shutdownOtel()`.
 */
function endInflightSpans(reason: string): void {
  try {
    if (state.modelSpan) {
      state.modelSpan.setAttribute('error.type', reason);
      state.modelSpan.end();
      state.modelSpan = undefined;
    }
    if (state.turnSpan) {
      state.turnSpan.setAttribute('error.type', reason);
      state.turnSpan.end();
      state.turnSpan = undefined;
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Assembles every tool the pi-server session exposes: the built-in file/bash
 * tools (wrapped with the permission gate + span instrumentation), the Agent
 * delegation tool (if agentContext is provided), the collaboration + planning
 * tool sets, and any MCP-backed extension tools already connected in
 * handleInit.
 */
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
    customEndpoint?: { api: 'openai-completions' | 'anthropic-messages'; supportsImages?: boolean; contextWindow?: number; maxTokens?: number; reasoning?: boolean; thinkingFormat?: 'qwen' };
    permissionMode: 'plan' | 'auto';
  },
): ToolDefinition<any, any>[] {
  const tools: ToolDefinition<any, any>[] = [
    wrapWithPermissionGate(createReadToolDefinition(cwd)),
    wrapWithPermissionGate(createBashToolDefinition(cwd), { catastrophicRmCwd: cwd }),
    wrapWithPermissionGate(createEditToolDefinition(cwd)),
    wrapWithPermissionGate(createWriteToolDefinition(cwd)),
    wrapWithPermissionGate(createGrepToolDefinition(cwd)),
    wrapWithPermissionGate(createFindToolDefinition(cwd)),
    wrapWithPermissionGate(createLsToolDefinition(cwd)),
    // Web tools — read-only, but still routed through the permission
    // gate so plan/auto modes stay in control.
    wrapWithPermissionGate(createPiWebFetchTool()),
    wrapWithPermissionGate(createPiWebSearchTool()),
    wrapWithPermissionGate(createPiBrowserTool(() => state.init?.sessionId ?? '', requestBrowserTool)),
  ];

  // Add Agent tool if we have the necessary context
  if (agentContext) {
    tools.push(wrapWithPermissionGate(createPiAgentTool({
      ...agentContext,
      piAuthProvider: agentContext.piAuthProvider as PiAuthProvider,
      cwd,
    })));
  }

  // Add collaboration tools (not wrapped with permission gate - they ARE the engagement)
  tools.push(...createCollaborationTools(agentContext?.sessionId || ''));

  // Add planning tools (not wrapped with permission gate - they manage the workflow)
  tools.push(...createPlanningTools(agentContext?.sessionId || ''));

  // MCP-backed extension tools. Connected once at init and reused across
  // session rebuilds. Routed through the permission gate like any other write
  // tool — an MCP call is an external side effect the user should control.
  tools.push(...state.mcpTools.map((t) => wrapWithPermissionGate(t)));

  return tools.map(instrumentTool);
}

/* ============================================================ */
/*  init                                                          */
/* ============================================================ */

function compactionObservabilityExtension(): InlineExtension {
  return {
    name: 'minimalist-agent-compaction-otel',
    hidden: true,
    factory: (pi) => {
      pi.on('session_before_compact', (event) => {
        // Manual (`/compact` button) runs on its own explicit turn the user is
        // already watching for, and shares the same abort path — skip the
        // silent-hang watchdog here, it's only for the automatic pre-prompt case.
        if (event.reason !== 'manual') {
          clearTimeout(state.compactionWatchdog);
          state.compactionWatchdog = setTimeout(() => {
            log.warn(
              `Auto-compaction (${event.reason}) silent for ${AUTO_COMPACTION_TIMEOUT_MS / 1000}s — ` +
                'force-aborting so the turn can proceed without it.',
            );
            try { state.session?.abortCompaction(); } catch { /* */ }
          }, AUTO_COMPACTION_TIMEOUT_MS);
        }
        if (event.reason === 'manual' || !isOtelEnabled()) return;
        const { span } = startSpan('compaction', {
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': state.init?.piAuthProvider ?? '',
            'gen_ai.conversation.id': state.init?.sessionId ?? '',
            'gen_ai.request.model': state.model?.id ?? state.init?.model ?? '',
            'minimalist_agent.compaction.reason': event.reason,
            'minimalist_agent.compaction.reserve_tokens': state.compactionSettings?.reserveTokens,
            'minimalist_agent.compaction.keep_recent_tokens': state.compactionSettings?.keepRecentTokens,
          },
        });
        state.autoCompactionSpan = span;
      });
    },
  };
}

async function handleInit(msg: MsgInit): Promise<void> {
  // Bring up tracing (no-op unless MA_OTEL_ENABLED) before any turn runs.
  await initOtel();
  state.init = msg;
  state.permissionMode = msg.permissionMode;
  state.autonomyLevel = msg.autonomyLevel ?? 50; // Default to 50 if not provided
  state.appendArr = msg.systemPrompt ? [msg.systemPrompt] : [];
  state.lastAppend = msg.systemPrompt ?? '';

  // Initialize PlanManager with sessions directory (parent of sessionPath)
  const sessionsDir = join(msg.sessionPath, '..');
  state.planManager = new PlanManager(sessionsDir);

  // Store available agents (passed from main process)
  state.availableAgents = (msg.availableAgents || []).map(a => ({
    slug: a.slug,
    metadata: a.metadata,
    content: a.content,
    path: a.path,
    iconPath: a.iconPath,
    source: (a.source ?? 'user') as import('../agents/types').AgentSource,
  }));

  const credentialStore = new InMemoryCredentialStore();
  if (msg.piAuth) {
    await writeAuthCredential(credentialStore, msg.piAuthProvider, msg.piAuth.credential);
  }
  state.credentialStore = credentialStore;

  const hasCustomEndpoint = !!msg.baseUrl?.trim() && !!msg.customEndpoint;
  state.hasCustomEndpoint = hasCustomEndpoint;

  const modelRuntime = await ModelRuntime.create({ credentials: credentialStore });
  state.modelRuntime = modelRuntime;
  const modelRegistry = new ModelRegistry(modelRuntime);
  state.modelRegistry = modelRegistry;
  let model: Model<Api>;
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
    const ce = msg.customEndpoint!;
    modelRegistry.registerProvider('custom-endpoint', {
      baseUrl: apiBase,
      apiKey,
      api: ce.api,
      authHeader: true,
      models: [{
        id: modelId,
        name: modelId,
        reasoning: ce.reasoning ?? true,
        // 'qwen' forces enable_thinking:false so local Ollama Qwen3 models
        // don't stall ~30s before the first token. Remote OpenAI-compatible
        // providers (StepFun, DeepSeek, …) omit this and reason natively.
        ...(ce.thinkingFormat ? { compat: { thinkingFormat: ce.thinkingFormat } } : {}),
        input: ce.supportsImages ? ['text', 'image'] : ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: ce.contextWindow ?? 131_072,
        maxTokens: ce.maxTokens ?? 8_192,
      }],
    } as never);
    const resolved = (modelRegistry as unknown as { find: (p: string, id: string) => Model<Api> | undefined })
      .find('custom-endpoint', modelId);
    if (!resolved) fatal(`Could not resolve custom-endpoint model: ${modelId}`);
    model = resolved!;
  } else {
    // Resolve the Pi model. Dynamic model ids are passed at runtime so we
    // cast the provider string to its literal type for the typed catalog.
    model = getBuiltinModel(msg.piAuthProvider as 'github-copilot', msg.model as never);
    
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
    model = await withResolvedBaseUrl(model, modelRuntime);
  }
  // Honour the app's live image capability: when the active model can't accept
  // images (e.g. enterprise Copilot policy), drop 'image' from the model's
  // input so pi-ai's transformMessages downgrades image blocks (current +
  // history) to a text placeholder instead of the provider rejecting them.
  state.visionSupported = msg.visionSupported;
  model = applyVisionInput(model, msg.visionSupported);
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
      if (!state.credentialStore) throw new Error('Credential store not initialized');
      const cred = await state.credentialStore.read(msg.piAuthProvider);
      if (cred?.type === 'oauth') {
        const oc = cred as OAuthCredential;
        return { access: oc.access, refresh: oc.refresh, expires: oc.expires };
      }
      const auth = await state.modelRuntime?.getAuth(msg.piAuthProvider);
      return { access: auth?.auth.apiKey || '' };
    },
    ...(hasCustomEndpoint ? {
      baseUrl: msg.baseUrl,
      customEndpoint: msg.customEndpoint,
    } : {}),
    permissionMode: msg.permissionMode as 'plan' | 'auto',
  };

  // Connect MCP-backed extensions before building tools so their adapted
  // tools are present on the very first turn. Failures are isolated per server
  // and never block boot (bounded global budget inside connectMcpServers).
  if (msg.mcpServers && msg.mcpServers.length > 0) {
    const mcp = await connectMcpServers(msg.mcpServers);
    state.mcpTools = mcp.tools;
    state.mcpClients = mcp.clients;
    send({ type: 'mcp_status', sessionId: msg.sessionId, servers: mcp.diagnostics });
  }

  const tools = buildWrappedTools(msg.cwd, agentContext);

  const agentDir = join(homedir(), '.pi', 'agent');
  const resourceLoader = new DefaultResourceLoader({
    cwd: msg.cwd,
    agentDir,
    appendSystemPrompt: state.appendArr,
    extensionFactories: [compactionObservabilityExtension()],
  });
  await resourceLoader.reload();
  state.resourceLoader = resourceLoader;

  const resolvedCompaction = resolveCompactionSettings(msg.compactionSettings, model);

  const { session } = await createAgentSession({
    cwd: msg.cwd,
    model,
    // Local models are slow enough without extended thinking.
    // Force minimal for custom endpoints; honour the user's setting otherwise.
    thinkingLevel: hasCustomEndpoint ? 'minimal' : mapThinkingLevel(msg.thinkingLevel),
    modelRuntime: state.modelRuntime,
    sessionManager,
    settingsManager: SettingsManager.inMemory({
      compaction: resolvedCompaction,
    }),
    resourceLoader,
    noTools: 'builtin',
    customTools: tools as never,
  });
  state.session = session;
  state.compactionSettings = resolvedCompaction;
  state.unsubscribe = session.subscribe(forwardEvent);

  // Set up PlanManager event forwarding
  if (state.planManager) {
    const sessionId = msg.sessionId;
    state.planManager.on('plan-created', (plan) => {
      send({ type: 'planning:created', sessionId, plan });
    });
    state.planManager.on('plan-updated', (plan) => {
      send({ type: 'planning:updated', sessionId, plan });
    });
    state.planManager.on('phase-updated', (planId, phase) => {
      send({ type: 'planning:phase-updated', sessionId, planId, phase });
    });
    state.planManager.on('plan-revised', (plan, revision) => {
      send({ type: 'planning:revised', sessionId, plan, revision });
    });
    state.planManager.on('plan-completed', (planId) => {
      send({ type: 'planning:completed', sessionId, planId });
    });
    state.planManager.on('plan-cancelled', (planId) => {
      send({ type: 'planning:cancelled', sessionId, planId });
    });
    state.planManager.on('plan-error', (planId, error, phaseId) => {
      send({ type: 'planning:error', sessionId, planId, error, phaseId });
    });
    state.planManager.on('phase-approval-required', (planId, phase) => {
      send({ type: 'planning:approval-required', sessionId, planId, phase });
    });
  }

  const ready: MsgReady = {
    type: 'ready',
    piSessionId: session.sessionId ?? null,
  };
  send(ready);
}

/* ============================================================ */
/*  Event forwarding                                             */
/* ============================================================ */

function forwardEvent(piEvent: AgentSessionEvent): void {
  if (!state.currentTurnId) return;

  const t = (piEvent as { type?: string }).type;

  if (t === 'message_start') {
    reportOperation('model_call');
  } else if (t === 'message_end') {
    reportOperation(undefined);
  }

  // GenAI `chat` span: one per assistant message (a tool loop yields several
  // per turn). Start on the assistant message_start, close on its message_end.
  if (isOtelEnabled() && state.turnContext) {
    if (t === 'message_start') {
      const m = (piEvent as { message?: { role?: string; model?: string } }).message;
      if (m && (m.role === 'assistant' || m.model) && !state.modelSpan) {
        const model = m.model ?? state.model?.id ?? state.init?.model ?? '';
        const { span } = startSpan(`chat ${model}`, {
          kind: SpanKind.CLIENT,
          parentContext: state.turnContext,
        });
        setAttrs(span, {
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': (m as { provider?: string }).provider ?? state.init?.piAuthProvider,
          'gen_ai.system': state.init?.piAuthProvider, // deprecated alias, kept for older backends
          'gen_ai.request.model': model,
          'gen_ai.conversation.id': state.init?.sessionId,
          'gen_ai.request.max_tokens': (state.model as { maxTokens?: number } | undefined)?.maxTokens,
          'server.address': serverAddress(),
        });
        state.modelSpan = span;
        state.modelSpanStartMs = Date.now();
        state.modelFirstTokenSeen = false;
        state.modelRequestCount = (state.modelRequestCount ?? 0) + 1;
        // The first model call's input is the turn's user message + system
        // prompt; attach it to this chat span (per-call input belongs here).
        if (state.modelRequestCount === 1 && state.turnInputAttrs) {
          setAttrs(span, state.turnInputAttrs);
        }
      }
    } else if (t === 'message_update' && state.modelSpan && !state.modelFirstTokenSeen) {
      const sub = (piEvent as { assistantMessageEvent?: { type?: string } }).assistantMessageEvent;
      if (sub?.type === 'text_delta' || sub?.type === 'thinking_delta') {
        state.modelFirstTokenSeen = true;
        const ttft = Date.now() - (state.modelSpanStartMs ?? Date.now());
        state.modelSpan.setAttribute('gen_ai.server.time_to_first_token', ttft / 1000);
        state.modelSpan.addEvent('gen_ai.first_token', { 'time_to_first_token_ms': ttft });
      }
    } else if (t === 'message_end' && state.modelSpan) {
      const m = (piEvent as { message?: AssistantMsg }).message;
      finishModelSpan(m);
    }
  }

  // Transcript-file id is stable per session unless an extension forks it
  // mid-conversation; re-check after every settled turn to catch that.
  if (t === 'turn_end' || t === 'agent_end') {
    const id = state.session?.sessionId;
    if (id && id !== state.lastSentSdkSessionId) {
      state.lastSentSdkSessionId = id;
      const u: MsgSessionIdUpdate = { type: 'session_id_update', piSessionId: id };
      send(u);
    }
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

  // Aborted (user-cancelled) auto-compactions never produce a `compaction`
  // chat event (see adaptPiEvent's compaction_end case), so the span opened
  // in compactionObservabilityExtension would otherwise never be closed —
  // catch that here directly off the raw SDK event.
  if (t === 'compaction_end') {
    clearTimeout(state.compactionWatchdog);
    state.compactionWatchdog = undefined;
  }
  if (t === 'compaction_end' && (piEvent as { aborted?: boolean }).aborted && state.autoCompactionSpan) {
    const span = state.autoCompactionSpan;
    state.autoCompactionSpan = undefined;
    setAttrs(span, { 'minimalist_agent.compaction.aborted': true });
    span.setStatus({ code: SpanStatusCode.OK });
    try { span.end(); } catch { /* */ }
  }

  const turnId = state.currentTurnId;
  const adapted = adaptPiEvent(piEvent);
  for (const ev of adapted) {
    // Defer `turn_done`: keep the per-turn channel open so any post-`agent_end`
    // compaction events (emitted by the SDK's post-run lifecycle) are still
    // forwarded. handlePrompt flushes the buffered terminal once the prompt
    // settles. The latest one wins if continuation produces several.
    if (ev.type === 'turn_done') {
      state.pendingTurnDone = { type: 'event', turnId, event: ev };
      continue;
    }
    const out: MsgEvent = { type: 'event', turnId, event: ev };
    send(out);
    if (ev.type === 'compaction' && state.autoCompactionSpan) {
      const span = state.autoCompactionSpan;
      state.autoCompactionSpan = undefined;
      setAttrs(span, {
        'minimalist_agent.compaction.tokens_before': ev.preTokens,
        'minimalist_agent.compaction.tokens_after': ev.postTokens,
      });
      if (ev.status === 'failed') {
        span.setStatus({ code: SpanStatusCode.ERROR, message: ev.errorMessage });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      try { span.end(); } catch { /* */ }
    }
    if (ev.type === 'error') {
      // Close any dangling model span before the turn span is ended.
      if (state.modelSpan) {
        try { state.modelSpan.end(); } catch { /* */ }
        state.modelSpan = undefined;
      }
      state.currentTurnId = undefined;
      state.turnAbort = undefined;
      state.pendingTurnDone = undefined;
    }
  }
}

/** Emit the turn's deferred `turn_done` (see forwardEvent) and tear down the
 *  per-turn state. Called once session.prompt() has fully settled, including
 *  any post-turn auto-compaction. No-op if no terminal was buffered. */
function flushPendingTurnDone(): void {
  const pending = state.pendingTurnDone;
  if (!pending) return;
  state.pendingTurnDone = undefined;
  send(pending);
  if (state.modelSpan) {
    try { state.modelSpan.end(); } catch { /* */ }
    state.modelSpan = undefined;
  }
  state.currentTurnId = undefined;
  state.turnAbort = undefined;
}

/* ============================================================ */
/*  prompt                                                        */
/* ============================================================ */

/**
 * Tracks the live `session.prompt()` promise so that a new prompt message
 * arriving while the previous one is still in its resolution tail (after the
 * terminal subscription event fired but before the promise settled) can wait
 * instead of calling `session.prompt()` concurrently and hitting the
 * "Agent is already processing" error from the Pi SDK.
 */
let activePromptPromise: Promise<void> | null = null;

async function runSessionPrompt(msg: MsgPrompt, alreadyRetried = false): Promise<void> {
  try {
    await state.session!.prompt(msg.message);
  } catch (e) {
    if (!alreadyRetried && isTransientOAuthRefreshError(e)) {
      log.warn('turn failed on transient OAuth refresh — retrying once:', errMessage(e));
      await delay(OAUTH_REFRESH_RETRY_DELAY_MS);
      return runSessionPrompt(msg, true);
    }
    throw e;
  }
}

async function handlePrompt(msg: MsgPrompt): Promise<void> {
  if (!state.session) fatal('Received prompt before init');

  if (activePromptPromise) {
    await activePromptPromise;
  }

  // Update the system-prompt append when it has changed (per-turn context).
  const newAppend = msg.systemPromptAppend ?? '';
  if (newAppend !== state.lastAppend && state.resourceLoader) {
    state.appendArr.length = 0;
    if (newAppend) state.appendArr.push(newAppend);
    state.lastAppend = newAppend;
    await state.resourceLoader.reload();
  }

  state.currentTurnId = msg.turnId;
  state.turnAbort = new AbortController();

  // Open the GenAI `invoke_agent` span. Child spans (chat, execute_tool) nest
  // under its context; it stays open until session.prompt() settles below.
  state.modelRequestCount = 0;
  const { span: turnSpan, context: turnCtx } = startSpan('invoke_agent minimalist-agent', {
    // When spawned as a sub-agent, nest under the parent's execute_tool span via
    // the propagated trace carrier; otherwise this is a fresh root trace.
    parentContext: msg.traceCarrier ? contextFromCarrier(msg.traceCarrier) : undefined,
    attributes: {
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.agent.name': 'minimalist-agent',
      'gen_ai.provider.name': state.init?.piAuthProvider ?? '',
      'gen_ai.conversation.id': state.init?.sessionId ?? '',
      'gen_ai.request.model': state.model?.id ?? state.init?.model ?? '',
      'session.id': state.init?.sessionId ?? '',
      'turn.id': msg.turnId,
      'permission.mode': state.permissionMode,
      'autonomy.level': state.autonomyLevel,
      'pi.provider': state.init?.piAuthProvider ?? '',
    },
  });
  state.turnSpan = turnSpan;
  state.turnContext = turnCtx;
  state.turnInputAttrs = undefined;
  if (captureContent()) {
    const inputAttrs = {
      'gen_ai.input.messages': safeAttr([{ role: 'user', content: msg.message }]),
      'gen_ai.system_instructions': msg.systemPromptAppend
        ? safeAttr(msg.systemPromptAppend)
        : undefined,
    };
    setAttrs(turnSpan, inputAttrs);
    // Mirror onto the first chat span of the turn (see forwardEvent): for the
    // first model call the input *is* this user message + system prompt.
    state.turnInputAttrs = inputAttrs;
  }

  const run = async (): Promise<void> => {
    try {
      await runSessionPrompt(msg);
      // The prompt (including any post-turn auto-compaction) has fully settled;
      // emit the deferred terminal so the compaction events that arrived after
      // agent_end have already reached the renderer ahead of turn_done.
      flushPendingTurnDone();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // The error path supersedes any buffered terminal for this turn.
      state.pendingTurnDone = undefined;
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
        log.error('session.prompt() threw after terminal event:', message);
      }
    }
  };

  activePromptPromise = otelContext.with(turnCtx, () => run());
  try {
    await activePromptPromise;
    turnSpan.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    recordException(turnSpan, err);
    turnSpan.setAttribute('error.type', err instanceof Error ? err.name : 'Error');
    throw err;
  } finally {
    activePromptPromise = null;
    // Safety net: never let a turn hang with an unflushed terminal (run()'s
    // try/catch normally handles this).
    flushPendingTurnDone();
    if (state.modelSpan) {
      try { state.modelSpan.end(); } catch { /* */ }
      state.modelSpan = undefined;
    }
    // Note: token usage is deliberately NOT rolled up onto the invoke_agent
    // span. Usage lives on the per-call `chat` spans only, so a cost ledger
    // that sums every token-bearing record counts each model call exactly once
    // (a turn-level duplicate would double-count). The turn keeps the request
    // count for quick "how many model calls this turn" reads.
    turnSpan.setAttribute('minimalist_agent.llm_request_count', state.modelRequestCount ?? 0);
    if (captureContent() && state.turnAssistantText) {
      turnSpan.setAttribute(
        'gen_ai.output.messages',
        safeAttr([{ role: 'assistant', content: state.turnAssistantText }]),
      );
    }
    try { turnSpan.end(); } catch { /* */ }
    state.turnSpan = undefined;
    state.turnContext = undefined;
    state.turnAssistantText = undefined;
    state.turnInputAttrs = undefined;
  }
}

/* ============================================================ */
/*  manual_compact                                                 */
/* ============================================================ */

const PLAN_TRACKING_TOOL_NAMES = new Set(['CreatePlan', 'ReportPhaseProgress', 'RevisePlan']);

function detectPlanPreservationInstructions(): string | undefined {
  if (!state.session) return undefined;
  let sawPlanTool = false;
  for (const entry of state.session.sessionManager.getBranch()) {
    if (entry.type !== 'message') continue;
    const content = (entry.message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const name = (block as { type?: string; name?: string }).name;
      if ((block as { type?: string }).type === 'tool_use' && name && PLAN_TRACKING_TOOL_NAMES.has(name)) {
        sawPlanTool = true;
        break;
      }
    }
    if (sawPlanTool) break;
  }
  if (!sawPlanTool) return undefined;
  return (
    'This conversation includes CreatePlan/ReportPhaseProgress/RevisePlan tool ' +
    'calls tracking a multi-phase execution plan. Preserve the exact current ' +
    'plan state verbatim in your summary: every phase name, its status ' +
    '(complete/running/pending/skipped), and the full text of any findings ' +
    'already reported — do not paraphrase or drop phase details.'
  );
}

async function resolveSummarizerModel(): Promise<Model<Api> | undefined> {
  const modelId = state.init?.compactionSettings?.summarizerModel;
  if (!modelId || !state.init || !state.modelRuntime) return undefined;
  const resolved = getBuiltinModel(state.init.piAuthProvider as 'github-copilot', modelId as never);
  if (!resolved) {
    log.warn(`Configured summarizer model "${modelId}" could not be resolved — using the active chat model instead.`);
    return undefined;
  }
  return withResolvedBaseUrl(resolved, state.modelRuntime);
}

async function handleManualCompact(msg: MsgManualCompact): Promise<void> {
  if (!state.session) return;

  if (activePromptPromise) {
    await activePromptPromise;
  }

  // Claim the same busy-slot `handlePrompt` uses, synchronously right after
  // the guard above resolves (no `await` in between) so a `prompt` message
  // racing in via the next stdin line can't slip through and run against the
  // summarizer model swapped in below, or clobber `state.currentTurnId`.
  const run = async (): Promise<void> => {
    const planInstructions = detectPlanPreservationInstructions();
    const combinedInstructions = [msg.customInstructions, planInstructions].filter(Boolean).join('\n\n') || undefined;

    const summarizerModel = await resolveSummarizerModel();
    const originalModel = state.model;
    if (summarizerModel) {
      try {
        await state.session!.setModel(summarizerModel as never);
      } catch (e) {
        log.warn('Failed to switch to summarizer model, using active chat model:', errMessage(e));
      }
    }

    state.currentTurnId = msg.turnId;
    try {
      await withSpan(
        'compaction',
        async (span) => {
          setAttrs(span, {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': state.init?.piAuthProvider ?? '',
            'gen_ai.conversation.id': state.init?.sessionId ?? '',
            'gen_ai.request.model': summarizerModel?.id ?? originalModel?.id ?? state.init?.model ?? '',
            'minimalist_agent.compaction.reason': 'manual',
            'minimalist_agent.compaction.plan_preserved': !!planInstructions,
          });
          try {
            await state.session!.compact(combinedInstructions);
            const last = state.session!.sessionManager.getBranch().at(-1);
            if (last?.type === 'compaction') {
              setAttrs(span, {
                'minimalist_agent.compaction.tokens_before': last.tokensBefore,
                'gen_ai.usage.input_tokens': last.usage?.input,
                'gen_ai.usage.output_tokens': last.usage?.output,
              });
            }
            span.setStatus({ code: SpanStatusCode.OK });
          } catch (e) {
            recordException(span, e);
            log.warn('manual compact() threw (compaction_end already reported failure):', errMessage(e));
          }
        },
      );
    } finally {
      if (summarizerModel && originalModel) {
        try {
          await state.session!.setModel(originalModel as never);
        } catch (e) {
          log.warn('Failed to restore chat model after manual compaction:', errMessage(e));
        }
      }

      if (state.currentTurnId === msg.turnId) {
        const out: MsgEvent = { type: 'event', turnId: msg.turnId, event: { type: 'turn_done' } };
        send(out);
        state.currentTurnId = undefined;
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

/**
 * Runs one hidden agent turn in an in-memory session (never touches disk,
 * never visible in chat history) with a task-specific system prompt in
 * place of Pi's own agent identity. Returns the assistant's final text.
 */
async function runEphemeralPrompt(args: {
  model: Model<Api>;
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
}): Promise<string> {
  const agentDir = join(homedir(), '.pi', 'agent');
  const resourceLoader = new DefaultResourceLoader({
    cwd: args.cwd,
    agentDir,
    systemPromptOverride: () => args.systemPrompt,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: args.cwd,
    model: args.model,
    modelRuntime: state.modelRuntime,
    sessionManager: SessionManager.inMemory(),
    resourceLoader,
  });

  let finalText = '';
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type !== 'agent_end') return;
    const assistantMessages = event.messages.filter(
      (m) => (m as { role?: string }).role === 'assistant',
    );
    const last = assistantMessages[assistantMessages.length - 1];
    if (last) finalText = pickTextFromMessage(last);
  });

  try {
    await session.prompt(args.userPrompt, {});
  } finally {
    unsubscribe();
  }

  return finalText;
}

async function handleMiniCompletion(msg: MsgMiniCompletion): Promise<void> {
  if (!state.init) {
    sendMiniError(msg.requestId, 'Subprocess not initialized.');
    return;
  }
  try {
    const model = !msg.model || msg.model === state.model?.id
      ? state.model!
      : getBuiltinModel(state.init.piAuthProvider as 'github-copilot', msg.model as never);

    if (msg.model && !model) {
      sendMiniError(
        msg.requestId,
        `Failed to resolve model "${msg.model}" for provider "${state.init.piAuthProvider}". ` +
        `Use a valid model ID or omit the model parameter to use the default.`
      );
      return;
    }

    const result = await withOperation('mini_completion', () =>
      tracedCompletion(
        {
          model: (model as { id?: string }).id ?? msg.model ?? state.model?.id ?? '',
          callKind: 'mini_completion',
          maxTokens: msg.maxTokens,
          inputMessages: [{ role: 'user', content: msg.userPrompt }],
          systemInstructions: msg.systemPrompt,
        },
        () =>
          withTimeout(
            runEphemeralPrompt({
              model: model as Model<Api>,
              systemPrompt: msg.systemPrompt,
              userPrompt: msg.userPrompt,
              cwd: state.init!.cwd,
            }),
            MINI_COMPLETION_CEILING_MS,
            'mini_completion',
          ).then((resultText) => ({ content: [{ type: 'text', text: resultText }] }) as never),
      ),
    );

    const out: MsgMiniCompletionResult = {
      type: 'mini_completion_result',
      requestId: msg.requestId,
      text: pickTextFromMessage(result),
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
    const model = !req.model || req.model === state.model.id
      ? state.model
      : getBuiltinModel(state.init.piAuthProvider as 'github-copilot', req.model as never);
    
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
    const resolvedModel = state.modelRuntime ? await withResolvedBaseUrl(model, state.modelRuntime) : model;
    
    const result = await withOperation('llm_query', () =>
      tracedCompletion(
        {
          model: (resolvedModel as { id?: string }).id ?? req.model ?? state.model?.id ?? '',
          callKind: 'llm_query',
          inputMessages: [{ role: 'user', content: req.userPrompt }],
          systemInstructions: req.systemPrompt,
        },
        () =>
          withTimeout(
            piModels.completeSimple(resolvedModel, {
              systemPrompt: req.systemPrompt,
              messages: [
                {
                  role: 'user',
                  content: [{ type: 'text', text: req.userPrompt }],
                },
              ],
              tools: req.tools ?? [],
            } as never) as Promise<AssistantMsg>,
            MINI_COMPLETION_CEILING_MS,
            'llm_query',
          ),
      ),
    );
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

    case 'manual_compact':
      await handleManualCompact(msg);
      return;

    case 'set_model':
      if (state.init) {
        try {
          let newModel = getBuiltinModel(
            state.init.piAuthProvider as 'github-copilot',
            msg.model as never,
          );
          
          // Validate model resolved successfully
          if (!newModel) {
            log.error(
              `Failed to resolve model "${msg.model}" for provider "${state.init.piAuthProvider}". ` +
              `Model change ignored.`
            );
            return;
          }
          
          newModel = await withResolvedBaseUrl(newModel, state.modelRuntime!);
          // Re-apply the image-input gate for the newly selected model so a
          // mid-conversation switch to a non-vision model downgrades existing
          // image history instead of erroring.
          state.visionSupported = msg.visionSupported;
          newModel = applyVisionInput(newModel, msg.visionSupported);
          state.model = newModel;
          // Propagate to the live session so the next prompt uses the new model.
          if (state.session) {
            await state.session.setModel(newModel as never);
            // Compaction tuning is window-relative, so a model switch changes
            // the resolved absolute reserveTokens/keepRecentTokens too.
            const resolvedCompaction = resolveCompactionSettings(
              state.init.compactionSettings,
              newModel,
            );
            state.session.settingsManager.applyOverrides({ compaction: resolvedCompaction });
            state.compactionSettings = resolvedCompaction;
          }
        } catch (e) {
          log.error('set_model failed:', e);
        }
      }
      return;

    case 'set_thinking_level':
      if (state.init) {
        // Custom endpoints (local/OpenAI-compatible) are pinned to 'minimal'
        // at init regardless of the requested level — keep that pin here too.
        const level = state.hasCustomEndpoint ? 'minimal' : mapThinkingLevel(msg.level);
        state.init.thinkingLevel = msg.level;
        // Propagate to the live session; setThinkingLevel clamps internally
        // per the model's supported levels, same as init does via mapThinkingLevel.
        if (state.session) {
          try {
            state.session.setThinkingLevel(level);
          } catch (e) {
            log.error('set_thinking_level failed:', e);
          }
        }
      }
      return;

    case 'set_permission_mode':
      state.permissionMode = msg.mode;
      return;

    case 'token_update':
      if (state.credentialStore && state.init) {
        await writeAuthCredential(
          state.credentialStore,
          state.init.piAuthProvider,
          msg.credential,
        );
      }
      return;

    case 'abort':
      try { state.session?.abort(); } catch { /* */ }
      // session.abort() does NOT cancel an in-flight auto-compaction summarization
      // call (it only aborts the main agent loop) — without this, clicking Stop
      // during a stalled compaction call does nothing and the turn stays hung.
      try { state.session?.abortCompaction(); } catch { /* */ }
      state.turnAbort?.abort();
      return;

    case 'pre_tool_use_response': {
      const pending = state.pendingPermission.get(msg.requestId);
      if (!pending) return;
      state.pendingPermission.delete(msg.requestId);
      
      // If the user approved a write tool while in plan mode, promote the
      // session to auto so the approved tool isn't immediately re-blocked.
      if (msg.action === 'allow') {
        promoteToAutoAfterApproval();
      }
      
      pending.resolve(msg);
      return;
    }

    case 'collaboration_response': {
      const pending = state.pendingCollaboration.get(msg.requestId);
      if (!pending) return;
      state.pendingCollaboration.delete(msg.requestId);
      pending.resolve(msg);
      return;
    }

    case 'auth_refresh_result': {
      // Don't delete here — settle() (in requestAuthRefresh) is the single
      // place that removes the entry, since it also races against the
      // timeout fallback. Deleting it here first would make settle()'s own
      // delete always find nothing and skip calling the real resolve(),
      // leaving the request pending forever regardless of this response.
      const pending = state.pendingAuthRefresh.get(msg.requestId);
      if (!pending) return;
      pending.resolve(msg);
      return;
    }

    case 'browser_tool_result': {
      const pending = state.pendingBrowserTool.get(msg.requestId);
      if (!pending) return;
      state.pendingBrowserTool.delete(msg.requestId);
      pending.resolve(msg);
      return;
    }

    case 'planning:approval-response': {
      // Handle approval/denial from user
      const { sessionId, phaseId, approved, notes } = msg;
      
      if (!state.planManager) {
        log.warn('Approval response received but planManager not initialized');
        return;
      }
      
      try {
        if (approved) {
          state.planManager.approvePhase(sessionId, phaseId, notes);
          // Approving a non-safe phase while still in plan mode must promote
          // the session to auto — otherwise the phase's write tools stay
          // blocked by the plan-mode guard right after the user approved them.
          promoteToAutoAfterApproval();
        } else {
          state.planManager.denyPhase(sessionId, phaseId, notes);
        }
      } catch (error) {
        log.error('Failed to handle approval response:', error);
      }
      
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
        log.error('steer failed:', e);
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
      await closeMcpClients(state.mcpClients);
      await shutdownOtel();
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
  if (state.shuttingDown) return;
  // Flush spans before exiting on stdin close (parent went away).
  void shutdownOtel().finally(() => process.exit(0));
});

// Flush tracing on signals / uncaught crashes so batched spans aren't dropped.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    void shutdownOtel().finally(() => process.exit(0));
  });
}
process.on('uncaughtException', (err) => {
  log.error('uncaught exception:', err);
  endInflightSpans('uncaught_exception');
  void shutdownOtel().finally(() => process.exit(1));
});
