// Flat, renderer-friendly chat event union shared by the runtime event adapter
// (`pi-server/event-adapter.ts`) and the renderer's `useChat` reducer,
// which is the single source of truth for assembling tool parts, partial
// JSON, etc. This module only defines the shapes — the actual Pi SDK →
// AgentChatEvent translation lives in `pi-server/event-adapter.ts`.

import type { AgentError } from './errors';

export type { AgentError };

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type NestedAgentChatEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'text_complete'; text: string }
  | { type: 'thinking_delta'; text: string }
  | {
      type: 'tool_start';
      toolUseId: string;
      name: string;
      input?: unknown;
    }
  | { type: 'tool_input_delta'; toolUseId: string; partialJson: string }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      type: 'turn_done';
      sessionId?: string;
      stopReason?: string;
      usage?: AgentUsage;
    }
  | {
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | { type: 'error'; error: AgentError; sessionId?: string };

export interface SubagentProgressUpdate {
  kind: 'subagent';
  execId: string;
  agentSlug: string;
  agentName?: string;
  phase?: 'spawning' | 'running' | 'finalizing' | 'done' | 'error';
  detail?: string;
  event?: NestedAgentChatEvent;
  at?: number;
}

export type AgentChatEvent =
  | { type: 'text_delta'; text: string }
  /** Emitted only when the backend sent the assistant message without partial events. */
  | { type: 'text_complete'; text: string }
  | { type: 'thinking_delta'; text: string }
  | {
      type: 'tool_start';
      toolUseId: string;
      name: string;
      /** Present when the tool comes in via the full assistant message (already parsed). */
      input?: unknown;
    }
  | { type: 'tool_input_delta'; toolUseId: string; partialJson: string }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      type: 'tool_progress';
      toolUseId: string;
      update: SubagentProgressUpdate;
    }
  | {
      type: 'turn_done';
      sessionId?: string;
      stopReason?: string;
      usage?: AgentUsage;
    }
  | {
      type: 'assistant_usage';
      usage: AgentUsage;
    }
  | {
      /** Backend finished compacting older messages between turns. */
      type: 'compaction';
      status: 'success' | 'failed';
      trigger: 'manual' | 'auto' | 'threshold' | 'overflow';
      preTokens?: number;
      postTokens?: number;
      durationMs?: number;
      summary?: string;
      readFiles?: string[];
      modifiedFiles?: string[];
      errorMessage?: string;
    }
  | {
      type: 'compaction_progress';
      phase: 'started' | 'retrying';
      trigger?: 'manual' | 'threshold' | 'overflow';
    }
  | { type: 'error'; error: AgentError; sessionId?: string };
