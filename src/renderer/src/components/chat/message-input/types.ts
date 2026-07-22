import type {
  ConnectionMeta,
  DraftAttachment,
  PermissionMode,
  ThinkingLevel,
} from '@/lib/electron';
import type { ChatMessage } from '@/lib/chat';
import type { CompactionNotice } from '@/hooks/useChat';

export type SendArgs = {
  text: string;
  connection: ConnectionMeta;
  model: string;
  cwd?: string;
  maxTurns?: number;
  permissionMode: PermissionMode;
  autonomyLevel?: number;
  thinkingLevel?: ThinkingLevel;
  attachments: DraftAttachment[];
};

export type MessageInputProps = {
  isStreaming: boolean;
  cwd?: string;
  onChangeCwd: (next: string | undefined) => void;
  /** Locks the folder picker — set after the first message has been sent. */
  cwdLocked?: boolean;
  permissionMode: PermissionMode;
  onChangePermissionMode: (mode: PermissionMode) => void;
  autonomyLevel: number;
  onChangeAutonomyLevel: (level: number) => void;
  thinkingLevel: ThinkingLevel;
  onChangeThinkingLevel: (level: ThinkingLevel) => void;
  onSend: (args: SendArgs) => void;
  onAbort: () => void;
  /**
   * Active turn id while streaming — used by the Steer button to inject
   * the textarea contents as a mid-turn user message.
   */
  streamingTurnId?: string | null;
  /**
   * Inject a user message into the running turn (mid-turn steer). Should
   * resolve `{ ok: false, reason }` on failure rather than throw — the
   * input clears optimistically and re-fills only on a non-ok result.
   */
  onSteer?: (message: string, attachments: DraftAttachment[]) => Promise<{ ok: boolean; reason?: string }>;
  /** Manually trigger compaction outside of any turn (Pi backend only). */
  onManualCompact?: (
    connectionSlug: string,
    customInstructions?: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  /** Active session id (null until first send creates one). */
  sessionId: string | null;
  /** Current session title — shown in the Info popover. */
  title: string;
  /** Conversation so far — used to derive the context-usage badge. */
  messages: ChatMessage[];
  /** Most recent SDK compaction event (for the transient notice). */
  lastCompaction: CompactionNotice | null;
  projectDefaultConnectionSlug?: string;
  sessionConnectionSlug?: string;
  sessionModel?: string;
  loadedSessionPickId?: string | null;
  /**
   * Pre-composed text to fill into the editor (e.g. from phase action buttons).
   * Once consumed the parent should clear it via onPendingMessageConsumed.
   */
  pendingMessage?: string;
  onPendingMessageConsumed?: () => void;
};

export type ModelPick = {
  slug: string;
  modelId: string;
};
