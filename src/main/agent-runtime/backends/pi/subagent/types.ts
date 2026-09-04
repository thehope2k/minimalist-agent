// Shared types for the Pi sub-agent tool (agent-tool.ts and siblings).
import type { ChildProcess } from 'node:child_process';
import type { Interface as ReadlineInterface } from 'node:readline';
import type { LoadedAgent } from '../../../../agents/types';
import type { PiAuthProvider } from '../protocol';

// Duplicated from worktree-manager.ts to avoid importing it (and its
// electron-aware logger) into the pi-server subprocess. See worktree-stub.ts.
export interface WorktreeResult {
  path: string;
  branch: string;
  created: boolean;
}

export interface AgentToolContext {
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
  customEndpoint?: { api: 'openai-completions' | 'anthropic-messages'; supportsImages?: boolean; contextWindow?: number; maxTokens?: number; reasoning?: boolean; thinkingFormat?: 'qwen' };
  /** Permission mode inherited from parent session. */
  permissionMode: 'plan' | 'auto';
  /** Parent session's model (for resolving session-default). */
  sessionModel: string;
}

export interface SpawnedAgentHandle {
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
  /** Timestamp when task execution began (post-init). */
  taskStartedAt?: number;
  /** Worktree info (if created). */
  worktree?: WorktreeResult;
}
