import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { createFauxCore, fauxAssistantMessage } from '@earendil-works/pi-ai';
import { InMemoryCredentialStore } from './credential-store';
import { createIsolatedResourceLoader } from './resource-loader';
import { adaptAgentEvent } from './event-adapter';
import type { AgentChatEvent } from '../agent-runtime/events';

vi.mock('./event-adapter/debug', () => ({ debug: vi.fn() }));

const TEST_TIMEOUT_MS = 15_000;
const FAST_RETRY_DELAY_MS = 10;
const SLOW_RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 2;
const TRANSIENT_ERROR = 'The service is temporarily unavailable';

let session: AgentSession;

const transientFailure = () =>
  fauxAssistantMessage('', { stopReason: 'error', errorMessage: TRANSIENT_ERROR });

interface TurnOptions {
  enabled: boolean;
  baseDelayMs?: number;
  abortWhileWaiting?: boolean;
  followUpPrompt?: boolean;
}

async function runTurn(
  responses: Array<() => ReturnType<typeof fauxAssistantMessage>>,
  options: TurnOptions,
): Promise<AgentChatEvent[]> {
  const faux = createFauxCore({ models: [{ id: 'faux-1' }] });
  faux.setResponses(responses);

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

  const settingsManager = SettingsManager.inMemory({
    retry: {
      enabled: options.enabled,
      maxRetries: MAX_RETRIES,
      baseDelayMs: options.baseDelayMs ?? FAST_RETRY_DELAY_MS,
      maxAgentDelayMs: (options.baseDelayMs ?? FAST_RETRY_DELAY_MS) * 5,
    },
  });
  const resourceLoader = createIsolatedResourceLoader({
    cwd: process.cwd(),
    settingsManager,
    extensionFactories: [],
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

  const emitted: AgentChatEvent[] = [];
  session.subscribe((event) => {
    const adapted = adaptAgentEvent(event);
    emitted.push(...adapted);
    if (options.abortWhileWaiting && adapted.some((e) => e.type === 'retry_progress')) {
      void session.abort();
    }
  });
  await session.prompt('hello');
  if (options.followUpPrompt) await session.prompt('again');
  return emitted;
}

const types = (events: AgentChatEvent[]) => events.map((e) => e.type);
const countOf = (events: AgentChatEvent[], type: AgentChatEvent['type']) =>
  types(events).filter((t) => t === type).length;
const retryEvents = (events: AgentChatEvent[]) => events.filter((e) => e.type === 'retry_progress');

afterEach(() => {
  session?.dispose();
});

describe('adaptAgentEvent › provider retry', () => {
  it(
    'hides a failure pi recovers from and ends in exactly one turn_done',
    async () => {
      const events = await runTurn([transientFailure, () => fauxAssistantMessage('recovered')], {
        enabled: true,
      });

      expect(countOf(events, 'error')).toBe(0);
      expect(countOf(events, 'turn_done')).toBe(1);
      expect(types(events).at(-1)).toBe('turn_done');
      expect(retryEvents(events)[0]).toMatchObject({
        phase: 'waiting',
        attempt: 1,
        maxAttempts: MAX_RETRIES,
      });
      expect(retryEvents(events).at(-1)).toMatchObject({ phase: 'done' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'surfaces one error and no turn_done once retries are exhausted',
    async () => {
      const events = await runTurn(
        Array.from({ length: MAX_RETRIES + 1 }, () => transientFailure),
        { enabled: true },
      );

      expect(countOf(events, 'error')).toBe(1);
      expect(countOf(events, 'turn_done')).toBe(0);
      expect(types(events).at(-1)).toBe('error');
      expect(retryEvents(events).at(-1)).toMatchObject({ phase: 'done' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'surfaces the error immediately when retry is disabled',
    async () => {
      const events = await runTurn([transientFailure], { enabled: false });

      expect(countOf(events, 'error')).toBe(1);
      expect(countOf(events, 'turn_done')).toBe(0);
      expect(retryEvents(events)).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'ends the turn with turn_done, not an error, when aborted during the backoff',
    async () => {
      const events = await runTurn([transientFailure], {
        enabled: true,
        baseDelayMs: SLOW_RETRY_DELAY_MS,
        abortWhileWaiting: true,
      });

      expect(countOf(events, 'error')).toBe(0);
      expect(types(events).at(-1)).toBe('turn_done');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'does not carry a recovered failure into the next turn',
    async () => {
      const events = await runTurn(
        [transientFailure, () => fauxAssistantMessage('one'), () => fauxAssistantMessage('two')],
        { enabled: true, followUpPrompt: true },
      );

      expect(countOf(events, 'error')).toBe(0);
      expect(countOf(events, 'turn_done')).toBe(2);
    },
    TEST_TIMEOUT_MS,
  );
});
