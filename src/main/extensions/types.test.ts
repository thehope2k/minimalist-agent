import { describe, expect, it } from 'vitest';
import type { ExtensionConfig } from './types';
import {
  hasSecretRefs,
  isPlaceholderValue,
  isToolBlocked,
  mcpSlugMatches,
  normalizeMcpNamePart,
  parseMcpToolName,
  resolveEnvValue,
  type EnvLookup,
} from './types';

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

describe('isPlaceholderValue', () => {
  it.each(['REPLACE_WITH_EMAIL', 'YOUR_API_URL', '<your-email>'])('flags %j', (value) =>
    expect(isPlaceholderValue(value)).toBe(true),
  );

  it.each(['https://jira-pg.atlassian.net', 'me@example.com', 'todo-sync', 'change-log', ''])(
    'accepts %j',
    (value) => expect(isPlaceholderValue(value)).toBe(false),
  );
});

describe('resolveEnvValue', () => {
  const lookup: EnvLookup = {
    secret: (key) => (key === 'tok' ? 'secret-value' : null),
    input: (key) => (key === 'email' ? 'me@x.com' : ''),
  };

  it('resolves secret and input refs from their own stores', () => {
    expect(resolveEnvValue({ secret: 'tok' }, 'user', lookup)).toBe('secret-value');
    expect(resolveEnvValue({ input: 'email' }, 'user', lookup)).toBe('me@x.com');
  });

  it('returns null (blocking) for unset refs and placeholder literals', () => {
    expect(resolveEnvValue({ secret: 'nope' }, 'user', lookup)).toBeNull();
    expect(resolveEnvValue({ input: 'nope' }, 'user', lookup)).toBeNull();
    expect(resolveEnvValue('REPLACE_ME', 'user', lookup)).toBeNull();
  });

  it('passes real literals through', () => {
    expect(resolveEnvValue('https://x.atlassian.net', 'user', lookup)).toBe(
      'https://x.atlassian.net',
    );
  });
});

describe('hasSecretRefs', () => {
  const base = { schemaVersion: 1, slug: 'x', name: 'x', description: 'x' } as const;

  it('does not treat a plain input as a credential', () => {
    expect(hasSecretRefs({ ...base, env: { A: { input: 'a' } } })).toBe(false);
    expect(hasSecretRefs({ ...base, env: { A: { secret: 'a' } } })).toBe(true);
  });
});
