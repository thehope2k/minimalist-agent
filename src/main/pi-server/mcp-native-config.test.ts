import { describe, expect, it } from 'vitest';
import { buildLoadedMcpConfig } from './mcp-native-config';

describe('buildLoadedMcpConfig', () => {
  it('returns empty servers/errors for undefined input', () => {
    expect(buildLoadedMcpConfig(undefined)).toEqual({ servers: [], errors: [] });
  });

  it('maps a stdio config and defaults exposure to direct', () => {
    const result = buildLoadedMcpConfig([
      { slug: 'linear', transport: 'stdio', command: 'npx', args: ['-y', '@linear/mcp-server'] },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.servers).toEqual([
      {
        name: 'linear',
        source: 'extension:linear',
        scope: 'extension',
        config: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@linear/mcp-server'],
          env: undefined,
          description: undefined,
          exposure: 'direct',
          toolExposure: undefined,
        },
      },
    ]);
  });

  it('maps an http config and passes through auth.provider', () => {
    const result = buildLoadedMcpConfig([
      {
        slug: 'docs',
        transport: 'http',
        url: 'https://example.com/mcp',
        auth: { provider: 'github' },
      },
    ]);
    expect(result.servers[0].config).toMatchObject({
      type: 'http',
      url: 'https://example.com/mcp',
      auth: { provider: 'github' },
      exposure: 'direct',
    });
  });

  it('respects an explicit exposure setting instead of the direct default', () => {
    const result = buildLoadedMcpConfig([
      { slug: 'sentry', transport: 'http', url: 'https://mcp.sentry.dev/mcp', exposure: 'hidden' },
    ]);
    expect(result.servers[0].config).toMatchObject({ exposure: 'hidden' });
  });

  it('skips sse-transport servers with a descriptive error, since pi has no sse transport', () => {
    const result = buildLoadedMcpConfig([
      { slug: 'legacy', transport: 'sse', url: 'https://legacy.example.com/sse' },
    ]);
    expect(result.servers).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/legacy/);
    expect(result.errors[0]).toMatch(/sse/);
  });
});
