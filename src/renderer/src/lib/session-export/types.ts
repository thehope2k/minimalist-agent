// Types for the session HTML exporter. The export pipeline is:
//
//   StoredMessage[]  --select-->  ExportModel  --redact/truncate-->  ExportModel
//                                                 --render-->  self-contained HTML
//
// ExportModel is a normalized, presentation-agnostic shape: selection has
// already decided *what* is included (per mode) and converted Edit/Write
// tool calls into structured diffs. The renderer only formats it.

import type { AgentUsage } from '../electron';

export type ExportMode = 'summary' | 'full';

/** User-facing names for the two modes. 'summary' = the conversation +
 *  outcomes; 'full' = the complete log incl. thinking/tool output. */
export const MODE_LABELS: Record<ExportMode, string> = {
  summary: 'Conversation',
  full: 'Full Log',
};

/** Filename-safe slugs for the two modes. */
export const MODE_SLUGS: Record<ExportMode, string> = {
  summary: 'conversation',
  full: 'full-log',
};

export interface ExportOptions {
  mode: ExportMode;
}

/** A user-message attachment, prepared for embedding (or marked dropped). */
export interface ExportAttachment {
  type: 'image' | 'pdf' | 'text' | 'snippet';
  name: string;
  mimeType: string;
  size: number;
  /** Inlined data URI when small enough to embed (images today). */
  dataUri?: string;
  /** True when the bytes were intentionally not embedded (heavy/disk-only). */
  dropped?: boolean;
}

/** Nested sub-agent transcript (full mode only). */
export interface ExportSubagent {
  agentName: string;
  parts: ExportPart[];
  error?: string;
}

/** A single todo item from a TodoWrite call. */
export interface ExportTodo {
  content: string;
  status?: string;
}

export type ExportPart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool';
      name: string;
      /** Pretty-printed input JSON (already stringified by selection). */
      inputText?: string;
      result?: { content: string; isError?: boolean };
      status: 'running' | 'done' | 'error';
      subagent?: ExportSubagent;
    }
  | {
      kind: 'diff';
      filePath: string;
      oldValue: string;
      newValue: string;
      additions: number;
      deletions: number;
      isError?: boolean;
      /** Error body when the edit/write failed. */
      errorContent?: string;
    }
  | { kind: 'todo'; items: ExportTodo[] };

export interface ExportTurn {
  id: string;
  role: 'user' | 'assistant';
  parts: ExportPart[];
  /** Model that produced an assistant turn. */
  model?: string;
  createdAt: number;
  durationMs?: number;
  usage?: AgentUsage;
  /** Stream-level error recorded on the turn. */
  error?: string;
  /** SDK stop_reason when not a clean end_turn. */
  stopReason?: string;
  attachments?: ExportAttachment[];
}

export type ExportRow =
  | { kind: 'turn'; turn: ExportTurn }
  | { kind: 'compaction'; trigger?: 'manual' | 'auto' };

export interface ExportMeta {
  title: string;
  /** Session creation time (ms). */
  createdAt: number;
  /** When this export was generated (ms). */
  exportedAt: number;
  mode: ExportMode;
  /** Distinct models seen across assistant turns, in first-seen order. */
  models: string[];
  /** Count of real user/assistant turns (excludes markers). */
  messageCount: number;
  /** Sum of per-turn durations, when available. */
  totalDurationMs?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
}

export interface ExportModel {
  meta: ExportMeta;
  rows: ExportRow[];
}
