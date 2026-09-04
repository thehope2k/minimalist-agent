// Pi backend Agent tool — spawns specialized sub-agents to handle focused tasks.
//
// Unlike Anthropic (native SDK support), Pi doesn't have built-in agent spawning.
// This tool creates nested Pi sessions with agent-specific system prompts and
// tool restrictions, then collects and formats the results.
//
// PARALLEL EXECUTION SAFETY:
// - Each invocation gets a unique session ID (timestamp + random)
// - Isolated storage paths prevent file conflicts
// - Global handle tracking for cleanup
// - Resource limits prevent runaway spawning
// - Proper subprocess lifecycle management
//
// Implementation is split across ./subagent/*: types, the worktree stub
// (see that file for why sub-agents can't use the real worktree-manager.ts),
// handle tracking + resource limits, subprocess spawn/init/execute, and the
// pure prompt/formatting helpers. This file only wires them into the
// `Agent` tool definition.

import { Type } from 'typebox';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createLogger } from '../../../../shared/sub-logger';
import type { LoadedAgent } from '../../../agents/types';
import type { AgentToolContext, SpawnedAgentHandle } from './subagent/types';
import { cleanupOrphanedWorktrees } from './subagent/worktree-stub';
import {
  getActiveAgentCount,
  killHandle,
  MAX_CONCURRENT_AGENTS,
  MAX_AGENT_RUNTIME_MINUTES,
} from './subagent/handle-registry';
import { emitSubagentUpdate, spawnAgentSubprocess } from './subagent/spawn';
import { initializeAgent, executeAgentTask } from './subagent/lifecycle';
import { formatAgentResult } from './subagent/prompt';
import { removeAgentWorktree } from './subagent/worktree-stub';

export { shutdownAllAgentSubprocesses } from './subagent/handle-registry';
export type { AgentToolContext } from './subagent/types';

const log = createLogger('pi-agent-tool');

/** Track if we've done orphaned cleanup this session (lazy, once per app run). */
let orphanedCleanupDone = false;

const agentToolSchema = Type.Object({
  agent: Type.String({ description: 'Agent slug — must exactly match a slug listed in the <agents> block of your system prompt. Do NOT invent or guess slugs; only use ones explicitly listed there.' }),
  task: Type.String({ description: 'Clear description of what the agent should do. Be specific about requirements and constraints.' }),
});

export function createPiAgentTool(ctx: AgentToolContext): ToolDefinition<typeof agentToolSchema, unknown> {
  return defineTool({
    name: 'Agent',
    label: 'Spawn sub-agent',
    description: [
      'Spawn a specialized sub-agent to handle a focused task.',
      'Use this when you need expert help in a specific domain (research, refactoring, testing, etc.)',
      'The agent will work independently and return its results to you.',
      '',
      'Available agents are listed in the system prompt.',
      '',
      `Note: Maximum ${MAX_CONCURRENT_AGENTS} agents can run concurrently. Agents are limited to ${MAX_AGENT_RUNTIME_MINUTES} minutes runtime.`,
    ].join('\n'),
    promptSnippet: 'Agent: Delegate work to a specialized sub-agent',
    parameters: agentToolSchema,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const { agent: agentSlug, task } = params as { agent: string; task: string };

      let handle: SpawnedAgentHandle | null = null;

      try {
        // Lazy cleanup of orphaned worktrees (once per app run)
        if (!orphanedCleanupDone) {
          orphanedCleanupDone = true;
          log.debug('Checking for orphaned worktrees...');
          void cleanupOrphanedWorktrees(ctx.cwd, 7).catch(err => {
            log.warn('Orphaned worktree cleanup failed:', err);
          });
        }

        // Check resource limits
        if (getActiveAgentCount() >= MAX_CONCURRENT_AGENTS) {
          log.warn(`At maximum capacity (${MAX_CONCURRENT_AGENTS} agents). Waiting for a slot...`);
        }

        // Validate agent exists
        const agent = ctx.availableAgents.find((a: LoadedAgent) => a.slug === agentSlug);
        if (!agent) {
          const validSlugs = ctx.availableAgents.map((a: LoadedAgent) => a.slug);
          const slugList = validSlugs.length > 0
            ? `Valid slugs: ${validSlugs.join(', ')}`
            : 'No agents are currently installed.';
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: [
                  `❌ Agent "${agentSlug}" not found.`,
                  '',
                  slugList,
                  '',
                  'Only use slugs from the <agents> list in your system prompt. Do NOT invent slugs.',
                ].join('\n'),
              },
            ],
          } as never;
        }

        emitSubagentUpdate(onUpdate, {
          kind: 'subagent',
          execId: toolCallId,
          agentSlug: agent.slug,
          agentName: agent.metadata.name,
          phase: 'spawning',
          detail: 'Starting subprocess',
          at: Date.now(),
        });

        log.debug(`Spawning agent "${agent.metadata.name}"...`);

        // Spawn and initialize subprocess
        handle = await spawnAgentSubprocess(agent, task, ctx, signal, (event, execId) => {
          if (event.type === 'tool_progress' || event.type === 'compaction' || event.type === 'compaction_progress') return;
          emitSubagentUpdate(onUpdate, {
            kind: 'subagent',
            execId,
            agentSlug: agent.slug,
            agentName: agent.metadata.name,
            phase: event.type === 'turn_done' ? 'finalizing' : event.type === 'error' ? 'error' : 'running',
            event,
            at: Date.now(),
          });
        });

        emitSubagentUpdate(onUpdate, {
          kind: 'subagent',
          execId: handle.execId,
          agentSlug: agent.slug,
          agentName: agent.metadata.name,
          phase: 'spawning',
          detail: 'Initializing session',
          at: Date.now(),
        });

        log.debug(`Agent initialized (${handle.execId}). Starting task...`);

        await initializeAgent(handle, agent, ctx);
        handle.taskStartedAt = Date.now();

        emitSubagentUpdate(onUpdate, {
          kind: 'subagent',
          execId: handle.execId,
          agentSlug: agent.slug,
          agentName: agent.metadata.name,
          phase: 'running',
          detail: 'Running task',
          at: Date.now(),
        });

        // Execute the task
        await executeAgentTask(handle, task, agent);

        // Clean up
        if (!handle.finished) {
          killHandle(handle);
        } else if (handle.worktree?.created) {
          // Agent finished normally, clean up worktree
          const execId = handle.execId; // Capture for closure
          await removeAgentWorktree(execId).catch(err => {
            log.warn(`Failed to cleanup worktree for ${execId}:`, err);
          });
        }

        emitSubagentUpdate(onUpdate, {
          kind: 'subagent',
          execId: handle.execId,
          agentSlug: agent.slug,
          agentName: agent.metadata.name,
          phase: 'done',
          detail: 'Completed',
          at: Date.now(),
        });

        // Format and return results
        const result = formatAgentResult(agent, handle.output, handle.error, handle.execId);

        return {
          isError: false,
          content: [{ type: 'text', text: result }],
        } as never;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Ensure cleanup on error
        if (handle && !handle.finished) {
          killHandle(handle);
        }

        emitSubagentUpdate(onUpdate, {
          kind: 'subagent',
          execId: handle?.execId ?? toolCallId,
          agentSlug,
          phase: 'error',
          detail: errorMsg,
          at: Date.now(),
        });

        // Pi only marks tool_result isError when execute() throws — returning isError:true is silently ignored.
        throw new Error(handle ? `${errorMsg} [exec: ${handle.execId}]` : errorMsg);
      }
    },
  });
}
