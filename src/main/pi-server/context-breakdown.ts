// Estimates the fixed part of every request — system prompt, project
// instructions, and tool definitions — so the context badge can show what
// the window is spent on. Uses pi's own chars/4 heuristic (see
// `estimateTokens` in pi-coding-agent's compaction); the renderer anchors
// the total on real usage and derives "conversation" as the remainder.
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { ContextBreakdown } from '../../shared/electron-api';

type ToolInfo = ReturnType<AgentSession['getAllTools']>[number];

const MCP_PREFIX = 'mcp__';
const PROJECT_CONTEXT_RE =
  /<project_context>[\s\S]*?<\/project_context>|<project_context_files[\s\S]*?<\/project_context_files>/g;

function estimate(chars: number): number {
  return Math.ceil(chars / 4);
}

function toolTokens(tool: ToolInfo): number {
  return estimate(
    JSON.stringify({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }).length,
  );
}

function mcpServerName(tool: ToolInfo): string {
  const ns = tool.namespace?.name ?? tool.name.split('__').slice(0, 2).join('__');
  return ns.startsWith(MCP_PREFIX) ? ns.slice(MCP_PREFIX.length) : ns;
}

export function computeContextBreakdown(
  session: Pick<AgentSession, 'systemPrompt' | 'getAllTools' | 'getActiveToolNames'>,
): ContextBreakdown {
  const prompt = session.systemPrompt;
  let projectChars = 0;
  for (const match of prompt.matchAll(PROJECT_CONTEXT_RE)) projectChars += match[0].length;

  const active = new Set(session.getActiveToolNames());
  const builtinTools = { tokens: 0, count: 0 };
  const servers = new Map<string, ContextBreakdown['mcpServers'][number]>();

  for (const tool of session.getAllTools()) {
    const isActive = active.has(tool.name);
    const isDeferred = !isActive && tool.exposure === 'deferred';
    if (!isActive && !isDeferred) continue;
    const tokens = toolTokens(tool);

    if (!tool.name.startsWith(MCP_PREFIX)) {
      if (isActive) {
        builtinTools.tokens += tokens;
        builtinTools.count++;
      }
      continue;
    }

    const name = mcpServerName(tool);
    const server = servers.get(name) ?? {
      name,
      tokens: 0,
      count: 0,
      deferredTokens: 0,
      deferredCount: 0,
    };
    if (isActive) {
      server.tokens += tokens;
      server.count++;
    } else {
      server.deferredTokens += tokens;
      server.deferredCount++;
    }
    servers.set(name, server);
  }

  return {
    systemPrompt: estimate(prompt.length - projectChars),
    projectInstructions: estimate(projectChars),
    builtinTools,
    mcpServers: [...servers.values()].sort(
      (a, b) => b.tokens + b.deferredTokens - (a.tokens + a.deferredTokens),
    ),
  };
}
