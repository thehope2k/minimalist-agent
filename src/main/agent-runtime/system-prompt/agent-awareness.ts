import { loadAllAgents } from '../../agents/storage';

let agentsBlockCache: { block: string; ts: number } | null = null;
const AGENTS_CACHE_TTL = 60_000;

export function invalidateAgentsPromptCache(): void {
  agentsBlockCache = null;
}

export function getAgentsAwarenessBlock(): string {
  const now = Date.now();
  if (agentsBlockCache && now - agentsBlockCache.ts < AGENTS_CACHE_TTL) {
    return agentsBlockCache.block;
  }

  const agents = loadAllAgents();
  const block = agents.length
    ? `<agents>
Delegate focused work to these sub-agents via the Agent tool when a task strongly matches one; give clear scope, target files, and the expected output. Otherwise do it directly.
${agents
  .map((agent) => {
    const tools = agent.metadata.tools?.join('/') || 'all';
    return `- ${agent.slug} (tools: ${tools}): ${agent.metadata.description}`;
  })
  .join('\n')}
</agents>`
    : '';

  agentsBlockCache = { block, ts: now };
  return block;
}
