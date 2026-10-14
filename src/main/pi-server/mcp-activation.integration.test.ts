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
import { activateMcpServers, mcpActivationExtension } from './mcp-activation';
import { createIsolatedResourceLoader } from './resource-loader';

vi.mock('./transport', () => ({ send: vi.fn() }));

const FIXTURE_SERVER = join(__dirname, '__fixtures__', 'mcp-fixture-server.mjs');
const FIXTURE_TOOL_PREFIX = 'mcp__fixture__';
const MCP_STARTUP_WAIT_MS = 10_000;
const TEST_TIMEOUT_MS = 30_000;

let session: AgentSession;
let toolsSeenPerRequest: string[][];

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

async function startSessionWithoutServers(): Promise<{ reloadExtensions: () => Promise<void> }> {
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
        loadConfig: () => buildLoadedMcpConfig([]),
        startupWaitMs: MCP_STARTUP_WAIT_MS,
      }),
      mcpActivationExtension(),
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
  return { reloadExtensions: () => resourceLoader.reload() };
}

beforeEach(() => {
  toolsSeenPerRequest = [];
});

afterEach(() => {
  session?.dispose();
});

describe('activating an MCP server mid-session', () => {
  it(
    'makes a server added after startup reachable through tool_search',
    async () => {
      const { reloadExtensions } = await startSessionWithoutServers();

      await reloadExtensions();
      activateMcpServers([
        { slug: 'fixture', transport: 'stdio', command: process.execPath, args: [FIXTURE_SERVER] },
      ]);
      await session.prompt('find record 7');

      expect(toolsSeenPerRequest[0]).toContain('tool_search');
      expect(toolsSeenPerRequest[0].some((n) => n.startsWith(FIXTURE_TOOL_PREFIX))).toBe(false);
      expect(toolsSeenPerRequest[1].some((n) => n.startsWith(FIXTURE_TOOL_PREFIX))).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});
