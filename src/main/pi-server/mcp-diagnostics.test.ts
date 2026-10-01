import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectMock = vi.fn();
const listToolsMock = vi.fn();
const closeMock = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function FakeClient() {
    return { connect: connectMock, listTools: listToolsMock, close: closeMock };
  }),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: vi.fn() }));

import { probeMcpServers } from './mcp-diagnostics';

beforeEach(() => {
  connectMock.mockReset().mockResolvedValue(undefined);
  listToolsMock.mockReset().mockResolvedValue({ tools: [{ name: 'a' }, { name: 'b' }] });
  closeMock.mockReset().mockResolvedValue(undefined);
});

describe('probeMcpServers', () => {
  it('returns an empty array for no configs', async () => {
    expect(await probeMcpServers(undefined)).toEqual([]);
    expect(await probeMcpServers([])).toEqual([]);
  });

  it('reports ok + toolCount on success, and always closes the client', async () => {
    const result = await probeMcpServers([{ slug: 'linear', transport: 'stdio', command: 'npx' }]);
    expect(result).toEqual([{ slug: 'linear', transport: 'stdio', ok: true, toolCount: 2 }]);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('isolates a failing server from others', async () => {
    connectMock
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
      .mockResolvedValue(undefined);

    const result = await probeMcpServers([
      { slug: 'bad', transport: 'stdio', command: 'npx' },
      { slug: 'good', transport: 'stdio', command: 'npx' },
    ]);

    expect(result.find((r) => r.slug === 'bad')).toMatchObject({ ok: false, error: 'boom' });
    expect(result.find((r) => r.slug === 'good')).toMatchObject({ ok: true, toolCount: 2 });
  });

  it('reports a timeout error when connect exceeds the per-server budget', async () => {
    connectMock.mockImplementation(() => new Promise(() => {}));
    const result = await probeMcpServers([{ slug: 'slow', transport: 'stdio', command: 'npx' }], {
      connectTimeoutMs: 20,
      totalBudgetMs: 1000,
    });
    expect(result[0].ok).toBe(false);
    expect(result[0].error).toMatch(/timed out/);
  });

  it('short-circuits sse configs without attempting a connection', async () => {
    const result = await probeMcpServers([
      { slug: 'legacy', transport: 'sse', url: 'https://legacy.example.com/sse' },
    ]);
    expect(result).toEqual([
      {
        slug: 'legacy',
        transport: 'sse',
        ok: false,
        reason: 'unsupported-transport',
        error: expect.stringContaining('sse'),
      },
    ]);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('short-circuits provider-auth http configs to an unverified-but-ok status', async () => {
    const result = await probeMcpServers([
      {
        slug: 'docs',
        transport: 'http',
        url: 'https://example.com/mcp',
        auth: { provider: 'github' },
      },
    ]);
    expect(result).toEqual([{ slug: 'docs', transport: 'http', ok: true }]);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('still probes an http config with literal headers and no provider auth', async () => {
    const result = await probeMcpServers([
      { slug: 'sentry', transport: 'http', url: 'https://mcp.sentry.dev/mcp' },
    ]);
    expect(result).toEqual([{ slug: 'sentry', transport: 'http', ok: true, toolCount: 2 }]);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('pairs short-circuited and probed servers correctly when mixed in one batch', async () => {
    connectMock
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
      .mockResolvedValue(undefined);

    const result = await probeMcpServers([
      { slug: 'legacy', transport: 'sse', url: 'https://legacy.example.com/sse' },
      { slug: 'bad', transport: 'stdio', command: 'npx' },
      { slug: 'docs', transport: 'http', url: 'https://example.com/mcp', auth: { provider: 'gh' } },
      { slug: 'good', transport: 'stdio', command: 'npx' },
    ]);

    expect(result.map((r) => r.slug)).toEqual(['legacy', 'bad', 'docs', 'good']);
    expect(result[0]).toMatchObject({ slug: 'legacy', reason: 'unsupported-transport' });
    expect(result[1]).toMatchObject({ slug: 'bad', ok: false, error: 'boom' });
    expect(result[2]).toMatchObject({ slug: 'docs', ok: true });
    expect(result[3]).toMatchObject({ slug: 'good', ok: true, toolCount: 2 });
    expect(connectMock).toHaveBeenCalledTimes(2);
  });
});
