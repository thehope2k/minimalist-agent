// Global tracking of spawned sub-agent subprocesses + resource limits
// (max concurrency, max runtime, stale-handle reaping, shutdown).
import { createLogger } from '../../../../../shared/sub-logger';
import type { SpawnedAgentHandle } from './types';
import { removeAgentWorktree, cleanupAllWorktrees } from './worktree-stub';
import { send } from './transport';

const log = createLogger('pi-agent-tool');

/** All active agent handles across all parent sessions. */
const activeHandles = new Map<string, SpawnedAgentHandle>();

/** Maximum concurrent agent subprocesses to prevent resource exhaustion. */
export const MAX_CONCURRENT_AGENTS = 5;

/** Maximum runtime per agent (minutes). */
export const MAX_AGENT_RUNTIME_MINUTES = 8;

export function generateExecId(agentSlug: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${agentSlug}-${timestamp}-${random}`;
}

export function registerHandle(handle: SpawnedAgentHandle): void {
  activeHandles.set(handle.execId, handle);
}

export function unregisterHandle(execId: string): void {
  activeHandles.delete(execId);
}

export function getActiveAgentCount(): number {
  return activeHandles.size;
}

export function killOldestHandle(): void {
  if (activeHandles.size === 0) return;

  let oldest: SpawnedAgentHandle | null = null;
  for (const handle of activeHandles.values()) {
    if (!oldest || handle.startedAt < oldest.startedAt) {
      oldest = handle;
    }
  }

  if (oldest) {
    log.warn(`Killing oldest agent ${oldest.execId} to free resources`);
    killHandle(oldest);
  }
}

export function killHandle(handle: SpawnedAgentHandle): void {
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

  // Clean up worktree (async, non-blocking)
  if (handle.worktree?.created) {
    void removeAgentWorktree(handle.execId).catch(err => {
      log.warn(`Failed to cleanup worktree for ${handle.execId}:`, err);
    });
  }
}

/** Periodic cleanup of stale handles. */
setInterval(() => {
  const now = Date.now();
  const maxRuntime = MAX_AGENT_RUNTIME_MINUTES * 60 * 1000;

  for (const handle of activeHandles.values()) {
    if (now - (handle.taskStartedAt ?? handle.startedAt) > maxRuntime && !handle.finished) {
      log.warn(`Killing stale agent ${handle.execId} (exceeded ${MAX_AGENT_RUNTIME_MINUTES}min runtime)`);
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

  // Clean up all worktrees
  void cleanupAllWorktrees().catch(err => {
    log.warn('Failed to cleanup worktrees on shutdown:', err);
  });
}
