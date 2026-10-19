import { describe, expect, it } from 'vitest';
import matter from 'gray-matter';
import type { LoadedSkill } from '../skills/types';
import type { LoadedAgent } from '../agents/types';
import type { LoadedExtension } from '../extensions/types';
import {
  convertAgent,
  convertGuide,
  convertMcp,
  convertSkill,
  mapTools,
  maOnlyReferences,
  resolveForClaude,
  toClaudeName,
} from './transform';

const skill = (over: Partial<LoadedSkill> = {}): LoadedSkill => ({
  slug: 'Code Review',
  metadata: {
    name: 'Code Review',
    description: 'Reviews code',
    alwaysAllow: ['Bash', 'Find', 'Ls'],
    icon: '🔍',
    globs: ['**/*.ts'],
  },
  content: 'Review the diff.\n',
  path: '/x',
  source: 'user',
  ...over,
});

const ext = (over: Partial<LoadedExtension['config']> = {}): LoadedExtension => ({
  slug: 'postman-mcp',
  scope: 'user',
  path: '/x',
  config: {
    schemaVersion: 1,
    slug: 'postman-mcp',
    name: 'Postman',
    description: 'Postman API',
    ...over,
  },
  guideFrontmatter: {},
  guideBody: 'Use the Postman tools.',
  variant: 'mcp-backed',
  guidePath: '/x/guide.md',
});

describe('toClaudeName', () => {
  it('makes kebab-case names Claude accepts', () => {
    expect(toClaudeName('Code Review')).toBe('code-review');
    expect(toClaudeName('GitHub_thehope2k')).toBe('github-thehope2k');
    expect(toClaudeName('--')).toBe('unnamed');
  });
});

describe('mapTools', () => {
  it('maps MA tool names, dedupes, and reports the rest', () => {
    expect(mapTools(['bash', 'Find', 'Ls', 'web_fetch', 'browser_tool'])).toEqual({
      mapped: ['Bash', 'Glob', 'WebFetch'],
      dropped: ['browser_tool'],
    });
  });
});

describe('convertSkill', () => {
  it('rewrites frontmatter for Claude and drops MA-only fields', () => {
    const { name, content } = convertSkill(skill());
    const parsed = matter(content);
    expect(name).toBe('code-review');
    expect(parsed.data).toEqual({
      name: 'code-review',
      description: 'Reviews code',
      'allowed-tools': 'Bash, Glob',
    });
    expect(parsed.content.trim()).toBe('Review the diff.');
  });

  it('warns about MA-only references in the body', () => {
    const { warnings } = convertSkill(
      skill({ content: 'Open it with browser_tool, then ask @code-review.' }),
    );
    expect(warnings).toEqual(['uses browser_tool', 'uses @-mentions']);
  });
});

describe('convertAgent', () => {
  it('maps tools and keeps the model', () => {
    const agent: LoadedAgent = {
      slug: 'auditor',
      metadata: {
        name: 'Auditor',
        description: 'Audits',
        tools: ['Read', 'Grep', 'Find'],
        model: 'opus',
      },
      content: 'You audit.',
      path: '/x',
      source: 'user',
    };
    expect(matter(convertAgent(agent).content).data).toEqual({
      name: 'auditor',
      description: 'Audits',
      tools: 'Read, Grep, Glob',
      model: 'opus',
    });
  });
});

describe('convertGuide', () => {
  it('turns the guide into a skill and lists the env vars it relies on', () => {
    const { name, content } = convertGuide(ext({ description: 'GitLab CLI' }), ['GITLAB_TOKEN']);
    expect(name).toBe('postman-mcp');
    expect(matter(content).data.description).toBe('GitLab CLI');
    expect(content).toContain('`GITLAB_TOKEN`');
  });
});

describe('resolveForClaude', () => {
  const lookup = {
    secret: (k: string) => (k === 'key' ? 's3cret' : null),
    input: (k: string) => (k === 'host' ? 'gitlab.example' : null),
  };

  it('classifies secrets, inputs, literals, and placeholders', () => {
    expect(resolveForClaude({ secret: 'key' }, lookup)).toEqual({
      kind: 'value',
      value: 's3cret',
      secret: true,
    });
    expect(resolveForClaude({ input: 'host' }, lookup)).toEqual({
      kind: 'value',
      value: 'gitlab.example',
      secret: false,
    });
    expect(resolveForClaude({ secret: 'nope' }, lookup)).toEqual({ kind: 'missing' });
    expect(resolveForClaude('${HOME}', lookup)).toEqual({
      kind: 'value',
      value: '${HOME}',
      secret: false,
    });
    expect(resolveForClaude('REPLACE_ME', lookup)).toEqual({ kind: 'missing' });
  });
});

describe('convertMcp', () => {
  const stdio = ext({
    mcp: { transport: 'stdio', command: 'npx', args: ['-y', 'pm'], envFromBinding: true },
  });
  const secretEnv = { API_KEY: { kind: 'value' as const, value: 's3cret', secret: true } };

  it('holds back a server that needs a secret unless opted in', () => {
    expect(convertMcp(stdio, secretEnv, false)).toMatchObject({ ok: false, usesSecrets: true });
    const ok = convertMcp(stdio, secretEnv, true);
    expect(ok.ok && JSON.parse(ok.converted.content)).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'pm'],
      env: { API_KEY: 's3cret' },
    });
  });

  it("skips servers that sign in through MA's own connection", () => {
    const http = ext({
      mcp: { transport: 'http', url: 'https://x', auth: { provider: 'github-copilot' } },
    });
    expect(convertMcp(http, {}, true)).toMatchObject({ ok: false });
  });

  it('reports missing setup values', () => {
    expect(convertMcp(stdio, { API_KEY: { kind: 'missing' } }, true)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('API_KEY'),
    });
  });
});

describe('maOnlyReferences', () => {
  it('ignores e-mail addresses', () => {
    expect(maOnlyReferences('mail me@example.com')).toEqual([]);
  });
});
