import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentSession,
  createMcpExtension,
  createToolSearchExtension,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
  type TranscriptContext,
} from '@earendil-works/pi-ai';
import { InMemoryCredentialStore } from './credential-store';
import { buildLoadedMcpConfig } from './mcp-native-config';
import { toolGovernanceExtension } from './tool-governance';
import { createIsolatedResourceLoader } from './resource-loader';
import { state } from './state';
import type { MsgPreToolUseRequest, PermissionMode } from '../agent-runtime/pi/protocol';

vi.mock('./transport', () => ({ send: vi.fn() }));
import { send } from './transport';

const FIXTURE_SERVER = join(__dirname, '__fixtures__', 'mcp-fixture-server.mjs');
const FIXTURE_TOOL_PREFIX = 'mcp__fixture__';
const MCP_STARTUP_WAIT_MS = 10_000;
const TEST_TIMEOUT_MS = 30_000;

type PermissionAnswer = { action: 'allow' } | { action: 'block'; reason: string };

let session: AgentSession;
let toolsSeenPerRequest: string[][];
let permissionRequests: MsgPreToolUseRequest[];

function declaredToolNames(context: TranscriptContext): string[] {
  const declared = new Set<string>();
  for (const message of context.messages) {
    if (message.role !== 'system') continue;
    message.toolsAdded?.forEach((tool) => declared.add(tool.name));
    message.toolsRemoved?.forEach((ref) =>
      declared.delete(typeof ref === 'string' ? ref : ref.name),
    );
  }
  return [...declared];
}

function answerPermissionRequests(answer: PermissionAnswer): void {
  vi.mocked(send).mockImplementation((msg) => {
    if (msg.type !== 'pre_tool_use_request') return;
    permissionRequests.push(msg);
    const pending = state.pendingPermission.get(msg.requestId);
    state.pendingPermission.delete(msg.requestId);
    pending?.resolve({ type: 'pre_tool_use_response', requestId: msg.requestId, ...answer });
  });
}

async function startSession(permissionMode: PermissionMode): Promise<void> {
  state.permissionMode = permissionMode;

  const faux = createFauxCore({ models: [{ id: 'faux-1' }] });
  faux.setResponses([
    (context) => {
      toolsSeenPerRequest.push(declaredToolNames(context));
      return fauxAssistantMessage(fauxToolCall('tool_search', { query: 'lookup record 7' }), {
        stopReason: 'toolUse',
      });
    },
    (context) => {
      const names = declaredToolNames(context);
      toolsSeenPerRequest.push(names);
      const loaded = names.find((n) => n.startsWith(FIXTURE_TOOL_PREFIX));
      return fauxAssistantMessage(fauxToolCall(loaded ?? 'missing', { id: 'abc' }), {
        stopReason: 'toolUse',
      });
    },
    (context) => {
      toolsSeenPerRequest.push(declaredToolNames(context));
      return fauxAssistantMessage('done');
    },
  ]);

  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    refreshOnCreate: false,
    modelsPath: null,
  });
  const [model] = faux.models;
  modelRuntime.registerProvider('faux', {
    api: faux.api,
    apiKey: 'unused',
    streamSimple: faux.streamSimple,
    models: [{ ...model }] as never,
  });

  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = createIsolatedResourceLoader({
    cwd: process.cwd(),
    settingsManager,
    extensionFactories: [
      createToolSearchExtension(),
      createMcpExtension({
        loadConfig: () =>
          buildLoadedMcpConfig([
            {
              slug: 'fixture',
              transport: 'stdio',
              command: process.execPath,
              args: [FIXTURE_SERVER],
              exposure: 'deferred',
            },
          ]),
        startupWaitMs: MCP_STARTUP_WAIT_MS,
      }),
      toolGovernanceExtension({ gatedToolNames: [] }),
    ],
  });
  await resourceLoader.reload();

  ({ session } = await createAgentSession({
    cwd: process.cwd(),
    model: modelRuntime.getModel('faux', 'faux-1'),
    modelRuntime,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader,
    noTools: 'builtin',
  }));
  await session.bindExtensions({ mode: 'rpc' });
}

function lastToolResultText(): string {
  const results = session.messages.filter((m) => m.role === 'toolResult');
  const last = results[results.length - 1];
  return JSON.stringify(last?.content ?? '');
}

beforeEach(() => {
  toolsSeenPerRequest = [];
  permissionRequests = [];
  vi.mocked(send).mockReset();
});

afterEach(() => {
  session?.dispose();
});

describe('deferred MCP exposure through tool_search', () => {
  it(
    'keeps deferred tools out of the first request and loads them on search',
    async () => {
      await startSession('auto');
      await session.prompt('find record 7');

      expect(toolsSeenPerRequest[0]).toContain('tool_search');
      expect(toolsSeenPerRequest[0].some((n) => n.startsWith(FIXTURE_TOOL_PREFIX))).toBe(false);
      expect(toolsSeenPerRequest[1].some((n) => n.startsWith(FIXTURE_TOOL_PREFIX))).toBe(true);
      expect(lastToolResultText()).toContain('record');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'still routes a call reached through tool_search to the permission gate',
    async () => {
      await startSession('plan');
      answerPermissionRequests({ action: 'allow' });
      await session.prompt('find record 7');

      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0].toolName.startsWith(FIXTURE_TOOL_PREFIX)).toBe(true);
      expect(lastToolResultText()).toContain('record');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'does not execute a loaded tool the gate blocks',
    async () => {
      await startSession('plan');
      answerPermissionRequests({ action: 'block', reason: 'blocked by test' });
      await session.prompt('find record 7');

      expect(permissionRequests).toHaveLength(1);
      expect(lastToolResultText()).toContain('blocked by test');
      expect(lastToolResultText()).not.toContain('record 7');
    },
    TEST_TIMEOUT_MS,
  );
});
