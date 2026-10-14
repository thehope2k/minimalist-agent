import { describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock('./storage', () => ({ loadAllExtensions: () => loaded.list }));
vi.mock('./registry', () => ({ getExtensionRegistry: () => ({ list: () => loaded.list }) }));
vi.mock('./mcp-config', () => ({ listMcpExtensionsStatus: () => [] }));

import { formatExtensionsAwareness } from './directive';

const ext = (slug: string, scope: 'user' | 'project', mcp?: object): unknown => ({
  slug,
  scope,
  guidePath: `/x/${slug}/guide.md`,
  config: { description: slug, ...(mcp ? { mcp } : {}) },
});

describe('formatExtensionsAwareness tool_search hint', () => {
  it('adds the hint when an MCP extension is active', () => {
    loaded.list = [ext('postman-mcp', 'user', { description: 'p' })];
    const out = formatExtensionsAwareness('/cwd', new Set(['postman-mcp']));
    expect(out).toContain('tool_search');
  });

  it('omits the hint when MCP extensions are all dormant', () => {
    loaded.list = [ext('postman-mcp', 'user', { description: 'p' }), ext('gh', 'user')];
    const out = formatExtensionsAwareness('/cwd', new Set());
    expect(out).not.toContain('Enabled MCP extensions');
    expect(out).toContain('Available but NOT loaded');
  });

  it('omits the hint when no extension is MCP-backed', () => {
    loaded.list = [ext('gh', 'user')];
    expect(formatExtensionsAwareness('/cwd', new Set())).not.toContain('tool_search');
  });
});
