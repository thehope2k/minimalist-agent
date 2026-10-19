import { describe, expect, it } from 'vitest';
import { computeContextBreakdown } from './context-breakdown';

type Session = Parameters<typeof computeContextBreakdown>[0];

function tool(name: string, exposure = 'direct', namespace?: string) {
  return {
    name,
    description: 'x'.repeat(40),
    parameters: { type: 'object', properties: {} },
    exposure,
    namespace: namespace ? { name: namespace } : undefined,
    sourceInfo: { path: '', source: '', scope: 'user', origin: 'top-level' },
  };
}

function session(prompt: string, tools: ReturnType<typeof tool>[], active: string[]): Session {
  return {
    systemPrompt: prompt,
    getAllTools: () => tools as never,
    getActiveToolNames: () => active,
  };
}

describe('computeContextBreakdown', () => {
  it('separates project instructions from the rest of the system prompt', () => {
    const project = '<project_context>' + 'a'.repeat(383) + '</project_context>';
    const b = computeContextBreakdown(session('b'.repeat(400) + project, [], []));
    expect(b.projectInstructions).toBe(Math.ceil(project.length / 4));
    expect(b.systemPrompt).toBe(100);
  });

  it('splits built-in, active MCP, and deferred MCP tools and skips inactive ones', () => {
    const tools = [
      tool('read'),
      tool('bash'),
      tool('hidden_helper', 'hidden'),
      tool('mcp__docs__search', 'direct', 'mcp__docs'),
      tool('mcp__docs__fetch', 'deferred', 'mcp__docs'),
      tool('mcp__jira__get', 'direct'),
    ];
    const b = computeContextBreakdown(
      session('', tools, ['read', 'bash', 'mcp__docs__search', 'mcp__jira__get']),
    );

    expect(b.builtinTools.count).toBe(2);
    expect(b.builtinTools.tokens).toBeGreaterThan(0);
    const docs = b.mcpServers.find((s) => s.name === 'docs')!;
    expect(docs).toMatchObject({ count: 1, deferredCount: 1 });
    expect(docs.deferredTokens).toBeGreaterThan(0);
    expect(b.mcpServers.find((s) => s.name === 'jira')).toMatchObject({
      count: 1,
      deferredCount: 0,
    });
  });
});
