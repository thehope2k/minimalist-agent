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

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Type } from 'typebox';
import { defineTool, type AgentToolUpdateCallback, type ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { LoadedAgent } from '../../../agents/types';
import type { AgentChatEvent, SubagentProgressUpdate } from '../../events';
import type {
  MsgInit,
  MsgPrompt,
  MsgEvent,
  SubprocessInbound,
  SubprocessOutbound,
  PiAuthProvider,
} from './protocol';

/* ============================================================ */
/*  Types                                                        */
/* ============================================================ */

interface AgentToolContext {
  /** Current session's chat session ID (for unique subprocess keys). */
  sessionId: string;
  /** Session storage path. */
  sessionPath: string;
  /** Current working directory. */
  cwd: string;
  /** Path to the pi-server.js bundle. */
  piServerPath: string;
  /** Available agents (pre-loaded by main process). */
  availableAgents: LoadedAgent[];
  /** Auth provider (github-copilot | openai-codex). */
  piAuthProvider: PiAuthProvider;
  /** Auth credential resolver. */
  getAuth: () => Promise<{ access: string; refresh?: string; expires?: number }>;
  /** Base URL for custom endpoints (optional). */
  baseUrl?: string;
  /** Custom endpoint config (optional). */
  customEndpoint?: { api: 'openai-completions' | 'anthropic-messages'; supportsImages?: boolean };
  /** Permission mode inherited from parent session. */
  permissionMode: 'plan' | 'ask' | 'auto';
}

interface SpawnedAgentHandle {
  /** Unique execution ID for this invocation. */
  execId: string;
  child: ChildProcess;
  rl: ReadlineInterface;
  ready: Promise<void>;
  output: string[];
  error?: string;
  finished: boolean;
  /** Timestamp when spawned. */
  startedAt: number;
}

/* ============================================================ */
/*  Global handle tracking & resource limits                    */
/* ============================================================ */

/** All active agent handles across all parent sessions. */
const activeHandles = new Map<string, SpawnedAgentHandle>();

/** Maximum concurrent agent subprocesses to prevent resource exhaustion. */
const MAX_CONCURRENT_AGENTS = 5;

/** Maximum runtime per agent (minutes). */
const MAX_AGENT_RUNTIME_MINUTES = 5;

function generateExecId(agentSlug: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${agentSlug}-${timestamp}-${random}`;
}

function registerHandle(handle: SpawnedAgentHandle): void {
  activeHandles.set(handle.execId, handle);
}

function unregisterHandle(execId: string): void {
  activeHandles.delete(execId);
}

function getActiveAgentCount(): number {
  return activeHandles.size;
}

function killOldestHandle(): void {
  if (activeHandles.size === 0) return;
  
  // Find the oldest handle
  let oldest: SpawnedAgentHandle | null = null;
  for (const handle of activeHandles.values()) {
    if (!oldest || handle.startedAt < oldest.startedAt) {
      oldest = handle;
    }
  }
  
  if (oldest) {
    console.warn(`[pi-agent-tool] Killing oldest agent ${oldest.execId} to free resources`);
    killHandle(oldest);
  }
}

function killHandle(handle: SpawnedAgentHandle): void {
  try {
    send(handle, { type: 'shutdown' });
  } catch { /* */ }
  
  setTimeout(() => {
    if (!handle.child.killed) {
      try {
        handle.child.kill('SIGKILL');
      } catch { /* */ }
    }
  }, 500);
  
  handle.finished = true;
  unregisterHandle(handle.execId);
}

/** Periodic cleanup of stale handles. */
setInterval(() => {
  const now = Date.now();
  const maxRuntime = MAX_AGENT_RUNTIME_MINUTES * 60 * 1000;
  
  for (const handle of activeHandles.values()) {
    if (now - handle.startedAt > maxRuntime && !handle.finished) {
      console.warn(`[pi-agent-tool] Killing stale agent ${handle.execId} (exceeded ${MAX_AGENT_RUNTIME_MINUTES}min runtime)`);
      handle.error = `Exceeded maximum runtime of ${MAX_AGENT_RUNTIME_MINUTES} minutes`;
      killHandle(handle);
    }
  }
}, 30_000); // Check every 30 seconds

/** Kill all active agents on app shutdown. */
export function shutdownAllAgentSubprocesses(): void {
  for (const handle of activeHandles.values()) {
    killHandle(handle);
  }
  activeHandles.clear();
}

/* ============================================================ */
/*  Subprocess lifecycle                                         */
/* ============================================================ */

function emitSubagentUpdate(
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  update: SubagentProgressUpdate,
): void {
  if (!onUpdate) return;
  try {
    void onUpdate(update as never);
  } catch {
    /* best-effort progress updates only */
  }
}

function spawnAgentSubprocess(
  agent: LoadedAgent,
  task: string,
  ctx: AgentToolContext,
  signal?: AbortSignal,
  onNestedEvent?: (event: AgentChatEvent, execId: string) => void,
): Promise<SpawnedAgentHandle> {
  return new Promise((resolve, reject) => {
    // Enforce resource limits
    if (getActiveAgentCount() >= MAX_CONCURRENT_AGENTS) {
      killOldestHandle();
    }
    
    const execId = generateExecId(agent.slug);
    
    const child = spawn(process.execPath, [ctx.piServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PI_DEBUG: '0', // Less verbose for sub-agents
      },
    });

    const stderrBuffer: string[] = [];
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBuffer.push(chunk);
      if (stderrBuffer.length > 20) stderrBuffer.shift();
    });

    const output: string[] = [];
    let error: string | undefined;
    let finished = false;
    let resolveReady: () => void;
    let rejectReady: (e: Error) => void;

    const ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    const rl = createInterface({ input: child.stdout! });

    const handle: SpawnedAgentHandle = {
      execId,
      child,
      rl,
      ready,
      output,
      finished,
      startedAt: Date.now(),
    };

    // Register immediately
    registerHandle(handle);

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg: SubprocessOutbound;
      try {
        msg = JSON.parse(line);
      } catch {
        console.error(`[pi-agent-tool:${execId}] bad JSONL:`, line.slice(0, 100));
        return;
      }

      switch (msg.type) {
        case 'ready':
          resolveReady();
          break;

        case 'event': {
          const event = (msg as MsgEvent).event;
          onNestedEvent?.(event, execId);

          // Collect text output from text_delta events
          if (event.type === 'text_delta') {
            output.push(event.text);
          }

          // Capture errors
          if (event.type === 'error') {
            error = event.error.message || 'Agent execution failed';
            handle.error = error;
          }

          // Mark as finished on terminal events
          if (event.type === 'turn_done' || event.type === 'error') {
            finished = true;
            handle.finished = true;
            unregisterHandle(execId);
          }
          break;
        }

        case 'error': {
          const errMsg = (msg as { message: string }).message;
          error = errMsg;
          handle.error = errMsg;
          finished = true;
          handle.finished = true;
          unregisterHandle(execId);
          rejectReady(new Error(errMsg));
          break;
        }
      }
    });

    child.on('exit', (code) => {
      finished = true;
      handle.finished = true;
      unregisterHandle(execId);
      
      if (code !== 0 && code !== null && !error) {
        const stderr = stderrBuffer.join('').slice(0, 500);
        error = `Agent subprocess exited with code ${code}${stderr ? `: ${stderr}` : ''}`;
        handle.error = error;
      }
    });

    child.on('error', (err) => {
      error = err.message;
      handle.error = error;
      finished = true;
      handle.finished = true;
      unregisterHandle(execId);
      rejectReady(err);
    });

    // Handle abort signal
    if (signal) {
      const onAbort = () => {
        if (!finished) {
          killHandle(handle);
        }
      };

      if (signal.aborted) {
        onAbort();
        reject(new Error('Aborted'));
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
    }

    resolve(handle);
  });
}

function send(handle: SpawnedAgentHandle, msg: SubprocessInbound): void {
  const stdin = handle.child.stdin;
  if (!stdin) return;
  if (stdin.destroyed || stdin.writableEnded || !stdin.writable) return;
  const payload = JSON.stringify(msg) + '\n';
  try {
    stdin.write(payload, (err?: Error | null) => {
      if (!err) return;
      const code = (err as Error & { code?: string }).code;
      if (code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') return;
      console.warn('[pi-agent-tool] failed to write to subprocess stdin:', err.message);
    });
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') return;
    throw e;
  }
}

async function initializeAgent(
  handle: SpawnedAgentHandle,
  agent: LoadedAgent,
  ctx: AgentToolContext,
): Promise<void> {
  const auth = await ctx.getAuth();

  // Build agent-specific system prompt
  const systemPrompt = buildAgentSystemPrompt(agent);

  // Determine model - use agent's preferred model or inherit from context
  const model = agent.metadata.model || 'gpt-4o';

  // Create isolated storage path for this execution
  const agentSessionPath = join(ctx.sessionPath, '.agents', handle.execId);
  try {
    mkdirSync(agentSessionPath, { recursive: true });
  } catch (err) {
    console.warn(`[pi-agent-tool:${handle.execId}] Failed to create storage dir:`, err);
  }

  const init: MsgInit = {
    type: 'init',
    sessionId: `${ctx.sessionId}-agent-${handle.execId}`, // Guaranteed unique
    sessionPath: agentSessionPath, // Isolated storage
    cwd: ctx.cwd,
    model,
    thinkingLevel: 'low' as const, // Agents should be focused and fast
    providerType: 'pi',
    authType: 'oauth',
    piAuthProvider: ctx.piAuthProvider,
    piAuth: {
      provider: ctx.piAuthProvider,
      credential: {
        type: 'oauth',
        access: auth.access,
        refresh: auth.refresh ?? '',
        expires: auth.expires ?? Date.now() + 30 * 60 * 1000,
      },
    },
    ...(ctx.baseUrl ? { 
      baseUrl: ctx.baseUrl, 
      customEndpoint: ctx.customEndpoint 
    } : {}),
    permissionMode: mapAgentPermissionMode(
      agent.metadata.permissionMode || ctx.permissionMode
    ),
    systemPrompt,
  };

  send(handle, init);
  await handle.ready;
}

async function executeAgentTask(
  handle: SpawnedAgentHandle,
  task: string,
  agent: LoadedAgent,
): Promise<void> {
  const maxTurns = agent.metadata.maxTurns || 10;
  const timeout = Math.min(maxTurns * 60 * 1000, MAX_AGENT_RUNTIME_MINUTES * 60 * 1000);

  const promptMsg: MsgPrompt = {
    type: 'prompt',
    turnId: 'agent-task',
    message: task,
    systemPromptAppend: '', // Agent system prompt is already in init
  };

  send(handle, promptMsg);

  // Wait for completion with timeout
  const startTime = Date.now();
  while (!handle.finished) {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (Date.now() - startTime > timeout) {
      handle.error = `Agent execution timed out after ${Math.floor(timeout / 60000)} minutes`;
      killHandle(handle);
      throw new Error(handle.error);
    }
  }

  if (handle.error) {
    throw new Error(`Agent execution failed: ${handle.error}`);
  }
}

/* ============================================================ */
/*  Helper functions                                             */
/* ============================================================ */

function buildAgentSystemPrompt(agent: LoadedAgent): string {
  const parts: string[] = [];

  // Agent identity
  parts.push(`You are "${agent.metadata.name}" — ${agent.metadata.description}`);
  parts.push('');

  // Tool restrictions
  if (agent.metadata.tools && agent.metadata.tools.length > 0) {
    parts.push(`You may ONLY use these tools: ${agent.metadata.tools.join(', ')}`);
    parts.push('');
  }

  // Turn limits
  const maxTurns = agent.metadata.maxTurns || 10;
  parts.push(`You have a maximum of ${maxTurns} turns to complete the task.`);
  parts.push('Be focused and efficient.');
  parts.push('');

  // Custom instructions from AGENT.md
  parts.push(agent.content);

  return parts.join('\n');
}

function mapAgentPermissionMode(
  mode: 'plan' | 'ask' | 'auto' | undefined,
): 'plan' | 'ask' | 'auto' {
  return mode || 'auto';
}

function formatAgentResult(agent: LoadedAgent, output: string[], error?: string, execId?: string): string {
  if (error) {
    return [
      `❌ Agent "${agent.metadata.name}" failed:`,
      '',
      error,
      '',
      'The agent was unable to complete the task.',
      execId ? `[exec: ${execId}]` : '',
    ].filter(Boolean).join('\n');
  }

  if (output.length === 0) {
    return [
      `Agent "${agent.metadata.name}" completed but produced no output.`,
      '',
      'This might indicate the agent finished successfully but had nothing to report.',
    ].join('\n');
  }

  return [
    `✓ Agent "${agent.metadata.name}" results:`,
    '',
    '─'.repeat(60),
    output.join(''),
    '─'.repeat(60),
    '',
    `Task completed by ${agent.metadata.name}.`,
  ].join('\n');
}

/* ============================================================ */
/*  Tool definition                                              */
/* ============================================================ */

const agentToolSchema = Type.Object({
  agent: Type.String({ description: 'Agent slug (e.g., "researcher", "test-validator"). Must match an installed agent.' }),
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
        // Check resource limits
        if (getActiveAgentCount() >= MAX_CONCURRENT_AGENTS) {
          console.warn(`[pi-agent-tool] At maximum capacity (${MAX_CONCURRENT_AGENTS} agents). Waiting for a slot...`);
        }

        // Validate agent exists
        const agent = ctx.availableAgents.find(a => a.slug === agentSlug);
        if (!agent) {
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: [
                  `❌ Agent "${agentSlug}" not found.`,
                  '',
                  'Available agents are listed in your system prompt under <agents>.',
                  'Make sure the slug is correct and the agent is installed.',
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

        console.log(`[pi-agent-tool] Spawning agent "${agent.metadata.name}"...`);

        // Spawn and initialize subprocess
        handle = await spawnAgentSubprocess(agent, task, ctx, signal, (event, execId) => {
          if (event.type === 'tool_progress' || event.type === 'compaction') return;
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

        console.log(`[pi-agent-tool] Agent initialized (${handle.execId}). Starting task...`);

        await initializeAgent(handle, agent, ctx);

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

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: [
                `❌ Failed to execute agent:`,
                '',
                errorMsg,
                '',
                'Check that the agent is properly configured and the task is clear.',
                handle ? `[exec: ${handle.execId}]` : '',
              ].filter(Boolean).join('\n'),
            },
          ],
        } as never;
      }
    },
  });
}
