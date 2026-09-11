// Raw subprocess spawning + JSONL stdout parsing for a single sub-agent.
// initializeAgent/executeAgentTask (lifecycle.ts) build on top of this to
// speak the init/prompt protocol once the child process is up.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentToolUpdateCallback } from '@earendil-works/pi-coding-agent';
import type { LoadedAgent } from '../../../agents/types';
import type { AgentChatEvent, SubagentProgressUpdate } from '../../events';
import { createLogger } from '../../../../shared/sub-logger';
import type { MsgEvent, SubprocessOutbound } from '../protocol';
import type { AgentToolContext, SpawnedAgentHandle } from './types';
import {
  getActiveAgentCount,
  killOldestHandle,
  killHandle,
  registerHandle,
  unregisterHandle,
  generateExecId,
  MAX_CONCURRENT_AGENTS,
} from './handle-registry';

const log = createLogger('agent-tool');

export function emitSubagentUpdate(
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

export function spawnAgentSubprocess(
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
        // Isolate this sub-agent's span file from the parent's so concurrent
        // agents never share one traces file (see perProcessOutfile in otel.ts).
        MA_OTEL_SUBAGENT: '1',
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
        log.error(`${execId} bad JSONL:`, line.slice(0, 100));
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
