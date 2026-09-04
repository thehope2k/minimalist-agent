// Init/prompt protocol messaging for an already-spawned sub-agent subprocess:
// send the `init` message (model/auth/worktree/system-prompt setup), then
// the `prompt` message and wait for task completion or timeout.
import { mkdirSync } from 'node:fs';
import type { LoadedAgent } from '../../../../agents/types';
import { createLogger } from '../../../../../shared/sub-logger';
import { injectTraceContext } from '../../../../../shared/otel';
import { subagentDir } from '../../../../../shared/subagent-storage';
import {
  resolveAgentModel,
  isValidModelId,
  getModelValidationError,
  SESSION_DEFAULT_MODEL,
} from '../../../../../shared/agent-models';
import type { MsgInit, MsgPrompt } from '../protocol';
import type { AgentToolContext, SpawnedAgentHandle } from './types';
import { createAgentWorktree } from './worktree-stub';
import { send } from './transport';
import { buildAgentSystemPrompt, mapAgentPermissionMode } from './prompt';
import { killHandle, MAX_AGENT_RUNTIME_MINUTES } from './handle-registry';

const log = createLogger('pi-agent-tool');

export async function initializeAgent(
  handle: SpawnedAgentHandle,
  agent: LoadedAgent,
  ctx: AgentToolContext,
): Promise<void> {
  const auth = await ctx.getAuth();

  // Build agent-specific system prompt
  const systemPrompt = buildAgentSystemPrompt(agent);

  // Resolve model - handle session-default properly
  const model = resolveAgentModel(agent.metadata.model, ctx.sessionModel);

  // Only validate explicit model overrides. When the agent inherits the
  // session model (session-default / omitted), that model is already in use
  // by the running session, so it's valid by definition even if our static
  // catalog hasn't caught up with the latest releases.
  const usesSessionModel =
    !agent.metadata.model || agent.metadata.model === SESSION_DEFAULT_MODEL;
  if (!usesSessionModel && !isValidModelId(model)) {
    throw new Error(
      `Agent "${agent.metadata.name}" has invalid model configuration: ${getModelValidationError(model)}. ` +
      `Check the agent's AGENT.md frontmatter.`
    );
  }

  // Create isolated storage path for this execution
  const agentSessionPath = subagentDir(ctx.sessionPath, handle.execId);
  try {
    mkdirSync(agentSessionPath, { recursive: true });
  } catch (err) {
    log.warn(`${handle.execId} Failed to create storage dir:`, err);
  }

  // Create isolated git worktree for this agent (if in git repo)
  const worktree = await createAgentWorktree(ctx.cwd, handle.execId);
  handle.worktree = worktree;

  const agentCwd = worktree.path; // Use worktree path (or fallback to original CWD)

  if (worktree.created) {
    log.debug(`${handle.execId} Running in isolated worktree: ${agentCwd}`);
  }

  const init: MsgInit = {
    type: 'init',
    sessionId: `${ctx.sessionId}-agent-${handle.execId}`, // Guaranteed unique
    sessionPath: agentSessionPath, // Isolated storage
    cwd: agentCwd, // Use worktree path for complete isolation
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

export async function executeAgentTask(
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
    // Nest the sub-agent's trace under the active `execute_tool Agent` span.
    // Undefined when tracing is off, so the field is simply omitted.
    traceCarrier: injectTraceContext(),
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
