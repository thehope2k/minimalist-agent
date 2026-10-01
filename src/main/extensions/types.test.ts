import { describe, expect, it } from 'vitest';
import type { ExtensionConfig } from './types';
import { isToolBlocked, mcpSlugMatches, normalizeMcpNamePart, parseMcpToolName } from './types';

describe('normalizeMcpNamePart', () => {
  it('replaces every non [A-Za-z0-9_] character with _', () => {
    expect(normalizeMcpNamePart('github-thehope2k')).toBe('github_thehope2k');
    expect(normalizeMcpNamePart('oracle-cloud')).toBe('oracle_cloud');
    expect(normalizeMcpNamePart('already_fine')).toBe('already_fine');
  });
});

describe('parseMcpToolName', () => {
  it('splits a qualified name into slug and tool', () => {
    expect(parseMcpToolName('mcp__linear__delete_issue')).toEqual({
      slug: 'linear',
      tool: 'delete_issue',
    });
  });

  it('returns null for non-MCP tool names', () => {
    expect(parseMcpToolName('read')).toBeNull();
    expect(parseMcpToolName('mcp__no_separator')).toBeNull();
  });
});

describe('mcpSlugMatches', () => {
  it('matches the literal slug (legacy bridge naming)', () => {
    expect(mcpSlugMatches('github-thehope2k', 'github-thehope2k')).toBe(true);
  });

  it('matches pi native naming where hyphens become underscores', () => {
    expect(mcpSlugMatches('github_thehope2k', 'github-thehope2k')).toBe(true);
    expect(mcpSlugMatches('oracle_cloud', 'oracle-cloud')).toBe(true);
  });

  it('rejects an unrelated slug', () => {
    expect(mcpSlugMatches('canva', 'github-thehope2k')).toBe(false);
  });
});

describe('isToolBlocked', () => {
  const baseConfig: ExtensionConfig = {
    schemaVersion: 1,
    slug: 'linear',
    name: 'Linear',
    description: 'Issue tracking',
    mcp: { transport: 'stdio', command: 'npx' },
    permissions: { blockedTools: ['delete-issue'] },
  };

  it('blocks a literal match', () => {
    expect(isToolBlocked(baseConfig, 'delete-issue')).toBe(true);
  });

  it('blocks pi-sanitized tool names authored with hyphens', () => {
    expect(isToolBlocked(baseConfig, 'delete_issue')).toBe(true);
  });

  it('allows anything not listed', () => {
    expect(isToolBlocked(baseConfig, 'create_issue')).toBe(false);
  });

  it('never blocks when the extension has no mcp block', () => {
    const noMcp: ExtensionConfig = { ...baseConfig, mcp: undefined };
    expect(isToolBlocked(noMcp, 'delete-issue')).toBe(false);
  });
});
