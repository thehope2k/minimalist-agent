import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InlineExtension } from '@earendil-works/pi-coding-agent';
import { state } from './state';
import { toolGovernanceExtension } from './tool-governance';

vi.mock('./transport', () => ({ send: vi.fn() }));
import { send } from './transport';

interface FakeSpan {
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}
const createdSpans: FakeSpan[] = [];

vi.mock('../../shared/otel', () => ({
  captureContent: () => false,
  safeAttr: (v: unknown) => JSON.stringify(v),
  setAttrs: vi.fn(),
  SpanStatusCode: { ERROR: 2 },
  startSpan: vi.fn(() => {
    const span: FakeSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
    createdSpans.push(span);
    return { span, context: {} };
  }),
}));

type Handler = (event: any) => any;

function registerHandlers(
  options: Parameters<typeof toolGovernanceExtension>[0] = {
    gatedToolNames: ['bash', 'edit', 'read', 'web_fetch'],
    catastrophicRm: { toolName: 'bash', cwd: '/work/project' },
  },
): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const fakePi = {
    on: (name: string, handler: Handler) => {
      handlers[name] = handler;
      return () => {};
    },
  };
  const ext = toolGovernanceExtension(options) as Extract<InlineExtension, { factory: unknown }>;
  ext.factory(fakePi as never);
  return handlers;
}

function resolvePendingPermission(response: {
  action: 'allow' | 'block' | 'modify';
  reason?: string;
  input?: unknown;
}): void {
  const [request] = (send as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [
    { requestId: string },
  ];
  const pending = state.pendingPermission.get(request.requestId);
  pending?.resolve({ type: 'pre_tool_use_response', requestId: request.requestId, ...response });
}

beforeEach(() => {
  state.permissionMode = 'plan';
  state.pendingPermission.clear();
  state.currentTurnId = 'turn-1';
  state.turnAbort = undefined;
  vi.mocked(send).mockClear();
  createdSpans.length = 0;
});

describe('toolGovernanceExtension — MCP tool_call', () => {
  it('ignores tools that are neither mcp nor gated', async () => {
    const handlers = registerHandlers();
    const result = await handlers.tool_call({
      toolCallId: 'a',
      toolName: 'RequestDecision',
      input: {},
    });
    expect(result).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips the permission round-trip in auto mode', async () => {
    state.permissionMode = 'auto';
    const handlers = registerHandlers();
    const result = await handlers.tool_call({
      toolCallId: 'b',
      toolName: 'mcp__linear__create_issue',
      input: {},
    });
    expect(result).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks the call when main denies the request', async () => {
    const handlers = registerHandlers();
    const callPromise = handlers.tool_call({
      toolCallId: 'c',
      toolName: 'mcp__linear__delete_issue',
      input: {},
    });
    resolvePendingPermission({
      action: 'block',
      reason: 'Plan mode: write operations not allowed',
    });
    const result = await callPromise;
    expect(result).toEqual({ block: true, reason: 'Plan mode: write operations not allowed' });
  });

  it('allows the call through when main approves', async () => {
    const handlers = registerHandlers();
    const callPromise = handlers.tool_call({
      toolCallId: 'd',
      toolName: 'mcp__linear__create_issue',
      input: {},
    });
    resolvePendingPermission({ action: 'allow' });
    const result = await callPromise;
    expect(result).toBeUndefined();
  });

  it('mutates event.input in place on a modify decision', async () => {
    const handlers = registerHandlers();
    const input: Record<string, unknown> = { title: 'original' };
    const callPromise = handlers.tool_call({
      toolCallId: 'e',
      toolName: 'mcp__linear__create_issue',
      input,
    });
    resolvePendingPermission({ action: 'modify', input: { title: 'patched' } });
    await callPromise;
    expect(input).toEqual({ title: 'patched' });
  });

  it('auto-blocks if the turn aborts before main responds', async () => {
    const controller = new AbortController();
    state.turnAbort = controller;
    const handlers = registerHandlers();
    const callPromise = handlers.tool_call({
      toolCallId: 'f',
      toolName: 'mcp__linear__delete_issue',
      input: {},
    });
    controller.abort();
    const result = await callPromise;
    expect(result).toEqual({ block: true, reason: 'Turn aborted' });
  });

  it('ends the open span when the turn aborts, instead of leaking it forever', async () => {
    const controller = new AbortController();
    state.turnAbort = controller;
    const handlers = registerHandlers();
    const callPromise = handlers.tool_call({
      toolCallId: 'g',
      toolName: 'mcp__linear__delete_issue',
      input: {},
    });
    const span = createdSpans.at(-1);
    expect(span?.end).not.toHaveBeenCalled();

    controller.abort();
    await callPromise;

    expect(span?.end).toHaveBeenCalledTimes(1);

    // A tool_result that still arrives afterward must not double-close it.
    handlers.tool_result({
      toolCallId: 'g',
      toolName: 'mcp__linear__delete_issue',
      isError: false,
      content: [],
    });
    expect(span?.end).toHaveBeenCalledTimes(1);
  });
});

describe('toolGovernanceExtension — tool_result', () => {
  it('ignores non-mcp tool results without throwing', () => {
    const handlers = registerHandlers();
    expect(() =>
      handlers.tool_result({ toolCallId: 'z', toolName: 'read', isError: false, content: [] }),
    ).not.toThrow();
  });

  it('closes an mcp span without throwing, matched or not', () => {
    const handlers = registerHandlers();
    expect(() =>
      handlers.tool_result({
        toolCallId: 'unmatched',
        toolName: 'mcp__linear__create_issue',
        isError: false,
        content: [],
      }),
    ).not.toThrow();
  });
});

describe('toolGovernanceExtension — built-in tool_call', () => {
  it('round-trips a gated write tool in plan mode and blocks on denial', async () => {
    const handlers = registerHandlers();
    const callPromise = handlers.tool_call({ toolCallId: 'w1', toolName: 'edit', input: {} });
    expect(send).toHaveBeenCalledTimes(1);
    resolvePendingPermission({ action: 'block', reason: 'nope' });
    expect(await callPromise).toEqual({ block: true, reason: 'nope' });
  });

  it('lets read-only built-ins through without a round trip', async () => {
    const handlers = registerHandlers();
    for (const toolName of ['read', 'web_fetch']) {
      expect(
        await handlers.tool_call({ toolCallId: toolName, toolName, input: {} }),
      ).toBeUndefined();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('does not open an MCP span for built-ins', async () => {
    state.permissionMode = 'auto';
    const handlers = registerHandlers();
    await handlers.tool_call({ toolCallId: 'x', toolName: 'edit', input: {} });
    expect(createdSpans).toHaveLength(0);
  });

  it('replaces the whole input on a modify decision', async () => {
    const handlers = registerHandlers();
    const input: Record<string, unknown> = { path: 'a', extra: 1 };
    const callPromise = handlers.tool_call({ toolCallId: 'm', toolName: 'edit', input });
    resolvePendingPermission({ action: 'modify', input: { path: 'b' } });
    await callPromise;
    expect(input).toEqual({ path: 'b' });
  });

  it('hard-blocks catastrophic deletes even in auto mode, without a round trip', async () => {
    state.permissionMode = 'auto';
    const handlers = registerHandlers();
    const result = await handlers.tool_call({
      toolCallId: 'rm',
      toolName: 'bash',
      input: { command: 'rm -rf /' },
    });
    expect(result).toMatchObject({ block: true });
    expect(result.reason).toContain('catastrophic delete');
    expect(send).not.toHaveBeenCalled();
  });

  it('lets harmless bash through in auto mode', async () => {
    state.permissionMode = 'auto';
    const handlers = registerHandlers();
    const result = await handlers.tool_call({
      toolCallId: 'ls',
      toolName: 'bash',
      input: { command: 'ls -la' },
    });
    expect(result).toBeUndefined();
  });

  it('auto-blocks if the turn aborts before main responds', async () => {
    const controller = new AbortController();
    state.turnAbort = controller;
    const handlers = registerHandlers();
    const callPromise = handlers.tool_call({ toolCallId: 'ab', toolName: 'bash', input: {} });
    controller.abort();
    expect(await callPromise).toEqual({ block: true, reason: 'Turn aborted' });
  });
});
