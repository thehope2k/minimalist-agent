import type { MessagePart } from '@/lib/chat';
import { type ParsedDiff, parseDiffInput, countDiffLines, EDIT_SEP } from './diff-utils';

export interface FileSummary {
  filePath: string;
  /** 'write' if any op in the group was a Write (it defines the baseline
   *  content, superseding earlier ops); 'edit' only when every op was an edit. */
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
  const groups = new Map<string, Array<{ parsed: ParsedDiff; opKind: 'edit' | 'write' }>>();
  for (const entry of raw) {
    if (!groups.has(entry.filePath)) {
      order.push(entry.filePath);
      groups.set(entry.filePath, []);
    }
    groups.get(entry.filePath)!.push({ parsed: entry.parsed, opKind: entry.opKind });
  }

  return order.map((fp) => {
    const ops = groups.get(fp)!;
    const { merged, kind } = mergeOps(ops);
    return {
      filePath: fp,
      lastOpKind: kind,
      merged,
      stats: countDiffLines(merged.oldValue, merged.newValue),
      opCount: ops.length,
    };
  });
}

function mergeOps(ops: Array<{ parsed: ParsedDiff; opKind: 'edit' | 'write' }>): {
  merged: ParsedDiff;
  kind: 'edit' | 'write';
} {
  const { filePath } = ops[0].parsed;

  // A Write anywhere in the group rewrites the whole file, so everything
  // before it is moot — including any earlier Edits. Find the *last* Write
  // (there could be several) and treat it as the new baseline.
  const lastWriteIdx = ops.map((o) => o.opKind).lastIndexOf('write');

  if (lastWriteIdx === -1) {
    // All edits: fast-path for the common single-edit case.
    if (ops.length === 1) return { merged: ops[0].parsed, kind: 'edit' };

    // Multiple edit patches: join with the separator so ReactDiffViewer shows
    // each hunk in context — same separator the edits[] parser already uses.
    return {
      merged: {
        filePath,
        oldValue: ops.map((o) => o.parsed.oldValue).join(EDIT_SEP),
        newValue: ops.map((o) => o.parsed.newValue).join(EDIT_SEP),
      },
      kind: 'edit',
    };
  }

  // Joining trailing edits as separate hunks (like the all-edits path above)
  // would show the Write's full content *and* the edit's snippet as two
  // unrelated hunks, double-counting the change — so replay them instead.
  let content = ops[lastWriteIdx].parsed.newValue;
  for (let i = lastWriteIdx + 1; i < ops.length; i++) {
    content = applyEditPairs(content, ops[i].parsed);
  }

  return { merged: { filePath, oldValue: '', newValue: content }, kind: 'write' };
}

function applyEditPairs(content: string, parsed: ParsedDiff): string {
  const oldParts = parsed.oldValue.split(EDIT_SEP);
  const newParts = parsed.newValue.split(EDIT_SEP);
  let result = content;
  for (let i = 0; i < oldParts.length; i++) {
    const oldText = oldParts[i];
    const newText = newParts[i] ?? '';
    // Skip rather than corrupt if an earlier replay already touched this text.
    if (!oldText || !result.includes(oldText)) continue;
    result = result.replace(oldText, newText);
  }
  return result;
}
