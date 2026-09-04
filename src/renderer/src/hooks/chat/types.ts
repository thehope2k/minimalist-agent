import type {
  ConnectionMeta,
  DraftAttachment,
  PermissionMode,
  ThinkingLevel,
} from '@/lib/electron';

export interface SendArgs {
  text: string;
  connection: ConnectionMeta;
  model: string;
  /** Working directory the agent should operate in (per-session). */
  cwd?: string;
  /** Bound for tool-use loops in this turn. */
  maxTurns?: number;
  /** Permission mode for this turn ('plan' | 'auto'). */
  permissionMode: PermissionMode;
  /**
   * Autonomy level (0-100) for this turn. Persisted to session meta so the
   * in-session slider value survives the fresh-chat null → newId transition
   * (otherwise it falls back to the project/global default).
   */
  autonomyLevel?: number;
  /**
   * Thinking-level override for this turn. Persisted to session meta so
   * the per-session picker survives the fresh-chat null → newId transition
   * (otherwise it falls back to AiSettings.defaultThinking).
   */
  thinkingLevel?: ThinkingLevel;
  /** Draft attachments — persisted to the session before send. */
  attachments?: DraftAttachment[];
  /**
   * If set, this is what the agent receives. The user-visible message
   * still shows `text`. Used by surfaces like the New Skill dialog to
   * keep scaffold context out of the chat transcript.
   */
  agentText?: string;
  /**
   * Origin tag — surfaced as a small chip above the user bubble. Drives
   * UI grouping for non-chat-originated submissions (e.g. 'add-skill').
   */
  intentTag?: string;
}

/**
 * Chat state for a specific session id. Pass `null` for an unsaved fresh
 * conversation — the session is created on first send.
 */
export interface CompactionNotice {
  at: number;
  status: 'running' | 'success' | 'failed';
  trigger: 'manual' | 'auto' | 'threshold' | 'overflow';
  preTokens?: number;
  postTokens?: number;
  errorMessage?: string;
}
