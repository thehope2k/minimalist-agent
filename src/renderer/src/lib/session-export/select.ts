// Selection / normalization: StoredMessage[] -> ExportModel.
//
// Two modes:
//   summary -> "outcomes in, mechanics out": user text + assistant prose +
//              diffs (Edit/Write) + turn-level errors. Drops thinking,
//              generic tool calls + raw output, todos, and subagent transcripts.
//   full    -> everything persisted (text/thinking/tool/diff/todo/subagent),
//              minus heavy attachment bytes.
//
// Pure module (no React / DOM) so it can be unit-reasoned and reused.

import type {
  SessionMeta,
  StoredAttachment,
  StoredMessage,
  StoredMessagePart,
  StoredSubagentTranscript,
} from '../electron';
import type {
  ExportAttachment,
  ExportMeta,
  ExportMode,
  ExportModel,
  ExportOptions,
  ExportPart,
  ExportRow,
  ExportSubagent,
  ExportTodo,
  ExportTurn,
} from './types';

const DIFF_TOOLS = new Set(['edit', 'write']);

/** Only embed image bytes we already hold inline; cap to keep files sane. */
const MAX_INLINE_IMAGE_BYTES = 1_500_000;

export function buildExportModel(
  meta: SessionMeta,
  messages: StoredMessage[],
  options: ExportOptions,
): ExportModel {
  const rows: ExportRow[] = [];
  const models: string[] = [];
  let messageCount = 0;
  let totalDurationMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const msg of messages) {
    if (msg.markerKind === 'compaction') {
      rows.push({ kind: 'compaction', trigger: msg.compactionMeta?.trigger });
      continue;
    }

    const parts = selectParts(msg, options.mode);
    const attachments =
      msg.role === 'user' ? selectAttachments(msg.attachments) : undefined;

    // Skip turns that ended up entirely empty after filtering (e.g. an
    // assistant turn that was only thinking + tool noise in summary mode),
    // unless it carries a turn-level error worth surfacing.
    const hasContent =
      parts.length > 0 ||
      (attachments && attachments.length > 0) ||
      Boolean(msg.error);
    if (!hasContent) continue;

    messageCount += 1;
    if (msg.model && !models.includes(msg.model)) models.push(msg.model);
    if (typeof msg.durationMs === 'number') totalDurationMs += msg.durationMs;
    if (msg.usage?.inputTokens) totalInputTokens += msg.usage.inputTokens;
    if (msg.usage?.outputTokens) totalOutputTokens += msg.usage.outputTokens;

    const turn: ExportTurn = {
      id: msg.id,
      role: msg.role,
      parts,
      model: msg.model,
      createdAt: msg.createdAt,
      durationMs: msg.durationMs,
      usage: msg.usage,
      error: msg.error,
      stopReason: msg.stopReason,
      attachments,
    };
    rows.push({ kind: 'turn', turn });
  }

  const exportMeta: ExportMeta = {
    title: meta.title || 'Untitled session',
    createdAt: meta.createdAt,
    exportedAt: Date.now(),
    mode: options.mode,
    models,
    messageCount,
    totalDurationMs: totalDurationMs || undefined,
    totalInputTokens: totalInputTokens || undefined,
    totalOutputTokens: totalOutputTokens || undefined,
  };

  return { meta: exportMeta, rows };
}

// ── Part selection ───────────────────────────────────────────────────────────

function selectParts(msg: StoredMessage, mode: ExportMode): ExportPart[] {
  // v1.0 sessions only have a flat `content` string.
  const stored: StoredMessagePart[] = msg.parts?.length
    ? msg.parts
    : msg.content
      ? [{ kind: 'text', text: msg.content }]
      : [];

  const out: ExportPart[] = [];
  for (const p of stored) {
    const converted = convertPart(p, mode);
    if (converted) out.push(converted);
  }
  return out;
}

function convertPart(
  p: StoredMessagePart,
  mode: ExportMode,
): ExportPart | null {
  if (p.kind === 'text') {
    return p.text.trim() ? { kind: 'text', text: p.text } : null;
  }

  if (p.kind === 'thinking') {
    if (mode === 'summary') return null; // mechanics
    return p.text.trim() ? { kind: 'thinking', text: p.text } : null;
  }

  // tool
  const lower = p.name.toLowerCase();

  if (DIFF_TOOLS.has(lower)) {
    const diff = toDiffPart(p);
    return diff; // kept in BOTH modes — diffs are outcomes
  }

  if (mode === 'summary') return null; // generic tools + todos are mechanics

  if (lower === 'todowrite') {
    const todo = toTodoPart(p.input);
    return todo;
  }

  return {
    kind: 'tool',
    name: p.name,
    inputText: formatInput(p.input, p.partialInputJson),
    result: p.result,
    status: p.status,
    subagent: p.subagent ? toSubagent(p.subagent) : undefined,
  };
}

function toSubagent(t: StoredSubagentTranscript): ExportSubagent {
  const parts: ExportPart[] = [];
  for (const p of t.parts ?? []) {
    const converted = convertPart(p, 'full');
    if (converted) parts.push(converted);
  }
  return {
    agentName: t.agentName || t.agentSlug || 'agent',
    parts,
    error: t.error,
  };
}

// ── Diff / todo conversion (inlined pure helpers) ────────────────────────────

interface ToolLike {
  name: string;
  input?: unknown;
  result?: { content: string; isError?: boolean };
  status: 'running' | 'done' | 'error';
}

function toDiffPart(p: ToolLike): ExportPart | null {
  const parsed = parseDiffInput(p.name, p.input);
  if (!parsed) {
    // Couldn't extract a diff (streaming/partial) — fall back to a tool part
    // so we never silently drop a real edit.
    return {
      kind: 'tool',
      name: p.name,
      result: p.result,
      status: p.status,
    };
  }
  const { additions, deletions } = countDiffLines(parsed.oldValue, parsed.newValue);
  const isError = p.status === 'error' || p.result?.isError;
  return {
    kind: 'diff',
    filePath: parsed.filePath,
    oldValue: parsed.oldValue,
    newValue: parsed.newValue,
    additions,
    deletions,
    isError: isError || undefined,
    errorContent: isError ? p.result?.content : undefined,
  };
}

function toTodoPart(input: unknown): ExportPart | null {
  if (!input || typeof input !== 'object') return null;
  const todos = (input as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return null;
  const items: ExportTodo[] = [];
  for (const t of todos) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const content = typeof o.content === 'string' ? o.content : '';
    if (!content) continue;
    items.push({
      content,
      status: typeof o.status === 'string' ? o.status : undefined,
    });
  }
  return items.length ? { kind: 'todo', items } : null;
}

interface ParsedDiff {
  filePath: string;
  oldValue: string;
  newValue: string;
}

/** Pure copy of diff-utils.parseDiffInput (kept here to avoid importing the
 *  React-heavy components/ module into a lib). */
function parseDiffInput(name: string, input: unknown): ParsedDiff | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const filePath = typeof o.file_path === 'string' ? o.file_path : '';
  if (!filePath) return null;

  if (name.toLowerCase() === 'write') {
    const content = typeof o.content === 'string' ? o.content : '';
    return { filePath, oldValue: '', newValue: content };
  }

  if (Array.isArray(o.edits) && o.edits.length > 0) {
    const edits = o.edits as Array<{ oldText?: unknown; newText?: unknown }>;
    const SEP = '\n\n// \u2500\u2500\u2500 next edit \u2500\u2500\u2500\n\n';
    const oldValue = edits
      .map((e) => (typeof e.oldText === 'string' ? e.oldText : ''))
      .join(SEP);
    const newValue = edits
      .map((e) => (typeof e.newText === 'string' ? e.newText : ''))
      .join(SEP);
    if (!oldValue && !newValue) return null;
    return { filePath, oldValue, newValue };
  }

  const oldValue = typeof o.old_string === 'string' ? o.old_string : '';
  const newValue = typeof o.new_string === 'string' ? o.new_string : '';
  if (!oldValue && !newValue) return null;
  return { filePath, oldValue, newValue };
}

/** Cheap line-count diff (counts changed lines; not a full LCS). Good enough
 *  for the +N/-N badge in the export. */
function countDiffLines(
  oldValue: string,
  newValue: string,
): { additions: number; deletions: number } {
  if (oldValue === newValue) return { additions: 0, deletions: 0 };
  const oldLines = oldValue ? oldValue.split('\n') : [];
  const newLines = newValue ? newValue.split('\n') : [];
  if (oldLines.length === 0) return { additions: newLines.length, deletions: 0 };
  if (newLines.length === 0) return { additions: 0, deletions: oldLines.length };
  const oldSet = new Map<string, number>();
  for (const l of oldLines) oldSet.set(l, (oldSet.get(l) ?? 0) + 1);
  let common = 0;
  for (const l of newLines) {
    const n = oldSet.get(l);
    if (n && n > 0) {
      common += 1;
      oldSet.set(l, n - 1);
    }
  }
  return {
    additions: Math.max(0, newLines.length - common),
    deletions: Math.max(0, oldLines.length - common),
  };
}

function formatInput(
  input: unknown,
  partialInputJson: string | undefined,
): string | undefined {
  if (input !== undefined && input !== null) {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      /* fall through */
    }
  }
  return partialInputJson || undefined;
}

// ── Attachments ──────────────────────────────────────────────────────────────

function selectAttachments(
  attachments: StoredAttachment[] | undefined,
): ExportAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => {
    // Images already carry inline base64; embed when small enough.
    if (
      a.type === 'image' &&
      a.resizedBase64 &&
      a.size <= MAX_INLINE_IMAGE_BYTES
    ) {
      return {
        type: a.type,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        dataUri: `data:${a.mimeType};base64,${a.resizedBase64}`,
      };
    }
    // Everything else (pdf/text/snippet, or oversized images) lives only on
    // disk — not embedded in a renderer-side export.
    return {
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      dropped: true,
    };
  });
}
