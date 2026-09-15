import type { PermissionMode, ThinkingLevel } from './settings';

export type ChatRole = 'user' | 'assistant';

export type StoredMessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string; outputTokens?: number }
  | {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input?: unknown;
      partialInputJson?: string;
      result?: { content: string; isError?: boolean };
      status: 'running' | 'done' | 'error';
      contextDelta?: number;
      contextDeltaGroupSize?: number;
    };

export type AttachmentType = 'image' | 'pdf' | 'text' | 'snippet' | 'office';

export interface StoredAttachment {
  type: AttachmentType;
  name: string;
  mimeType: string;
  size: number;
  storedPath: string;
  thumbnailBase64?: string;
  resizedBase64?: string;
  language?: string;
  lineCount?: number;
}

export interface MessageUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface StoredMessage {
  id: string;
  role: ChatRole;
  content: string;
  parts?: StoredMessagePart[];
  model?: string;
  error?: string;
  stopReason?: string;
  usage?: MessageUsage;
  latestCallUsage?: MessageUsage;
  durationMs?: number;
  createdAt: number;
  attachments?: StoredAttachment[];
  markerKind?: 'compaction';
  compactionMeta?: {
    status?: 'success' | 'failed';
    trigger: 'manual' | 'auto' | 'threshold' | 'overflow';
    preTokens?: number;
    postTokens?: number;
    durationMs?: number;
    summary?: string;
    readFiles?: string[];
    modifiedFiles?: string[];
    errorMessage?: string;
  };
}

export interface SessionUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface SessionMeta {
  id: string;
  title: string;
  workingDirectory?: string;
  runtimeSessionId?: string;
  archived: boolean;
  createdAt: number;
  lastMessageAt: number;
  usage?: SessionUsage;
  permissionMode?: PermissionMode;
  projectId?: string | null;
  connectionSlug?: string;
  model?: string;
  autonomyLevel?: number;
  pinnedAssets?: string[];
  thinkingLevel?: ThinkingLevel;
}
