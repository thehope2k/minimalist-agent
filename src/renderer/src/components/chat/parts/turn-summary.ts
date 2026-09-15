import type { MessagePart } from '@/lib/chat';
import { type ParsedDiff, parseDiffInput, countDiffLines, EDIT_SEP } from './diff-utils';

export interface FileSummary {
  filePath: string;
  /** 'write' if the last op was a Write; 'edit' otherwise. */
  lastOpKind: 'edit' | 'write';
  /** Net merged diff (old = pre-turn state, new = post-turn state). */
  merged: ParsedDiff;
  stats: { additions: number; deletions: number };
  /** How many tool calls touched this file — shown as a subtle hint. */
  opCount: number;
}

// ─── data derivation ────────────────────────────────────────────────────────

export function collectFileSummaries(parts: MessagePart[]): FileSummary[] {
  // Gather every successful Edit/Write, preserving order.
  const raw: Array<{ filePath: string; parsed: ParsedDiff; opKind: 'edit' | 'write' }> = [];
  for (const p of parts) {
    if (p.kind !== 'tool') continue;
    const lower = p.name.toLowerCase();
    if (lower !== 'edit' && lower !== 'write') continue;
    if (p.status !== 'done' || p.result?.isError) continue;
    const parsed = parseDiffInput(p.name, p.input);
    if (!parsed) continue;
    raw.push({ filePath: parsed.filePath, parsed, opKind: lower as 'edit' | 'write' });
  }

  if (raw.length === 0) return [];

  // Group by file path, preserving first-seen insertion order.
  const order: string[] = [];
  const groups = new Map<
    string,
    Array<{ parsed: ParsedDiff; opKind: 'edit' | 'write' }>
  >();
  for (const entry of raw) {
    if (!groups.has(entry.filePath)) {
      order.push(entry.filePath);
      groups.set(entry.filePath, []);
    }
    groups.get(entry.filePath)!.push({ parsed: entry.parsed, opKind: entry.opKind });
  }

  return order.map((fp) => {
    const ops = groups.get(fp)!;
    const merged = mergeOps(ops);
    return {
      filePath: fp,
      lastOpKind: ops[ops.length - 1].opKind,
      merged,
      stats: countDiffLines(merged.oldValue, merged.newValue),
      opCount: ops.length,
    };
  });
}

function mergeOps(
  ops: Array<{ parsed: ParsedDiff; opKind: 'edit' | 'write' }>,
): ParsedDiff {
  const { filePath } = ops[0].parsed;

  // If the last op is a Write it defines the authoritative final state.
  // oldValue is '' because we don't have the pre-turn snapshot — the diff
  // reads as "this is what the file looks like after the turn".
  const lastOp = ops[ops.length - 1];
  if (lastOp.opKind === 'write') {
    return { filePath, oldValue: '', newValue: lastOp.parsed.newValue };
  }

  // All edits: fast-path for the common single-edit case.
  if (ops.length === 1) return ops[0].parsed;

  // Multiple edit patches: join with the separator so ReactDiffViewer shows
  // each hunk in context — same separator the edits[] parser already uses.
  return {
    filePath,
    oldValue: ops.map((o) => o.parsed.oldValue).join(EDIT_SEP),
    newValue: ops.map((o) => o.parsed.newValue).join(EDIT_SEP),
  };
}

