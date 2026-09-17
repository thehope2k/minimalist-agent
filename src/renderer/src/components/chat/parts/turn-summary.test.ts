import { describe, expect, it } from 'vitest';
import type { MessagePart } from '@/lib/chat';
import { collectFileSummaries } from './turn-summary';

function toolPart(name: 'Write' | 'Edit', input: unknown): MessagePart {
  return {
    kind: 'tool',
    id: `${name}-${Math.random()}`,
    name,
    status: 'done',
    input,
    result: { isError: false },
  } as unknown as MessagePart;
}

function writeInput(filePath: string, content: string) {
  return { file_path: filePath, content };
}

function editInput(filePath: string, oldText: string, newText: string) {
  return { file_path: filePath, edits: [{ oldText, newText }] };
}

describe('collectFileSummaries', () => {
  it('Write only: final content becomes the new baseline', () => {
    const parts = [toolPart('Write', writeInput('/f.ts', 'line1\nline2\n'))];
    const [summary] = collectFileSummaries(parts);
    expect(summary.lastOpKind).toBe('write');
    expect(summary.merged.oldValue).toBe('');
    expect(summary.merged.newValue).toBe('line1\nline2\n');
  });

  it('Edit then Write: Write fully supersedes the earlier edit', () => {
    const parts = [
      toolPart('Edit', editInput('/f.ts', 'a', 'b')),
      toolPart('Write', writeInput('/f.ts', 'whole new file\n')),
    ];
    const [summary] = collectFileSummaries(parts);
    expect(summary.lastOpKind).toBe('write');
    expect(summary.merged.oldValue).toBe('');
    expect(summary.merged.newValue).toBe('whole new file\n');
  });

  it('Write then Edit: edit is replayed onto the written content, not joined as a separate hunk', () => {
    const parts = [
      toolPart('Write', writeInput('/f.ts', 'hello world\n')),
      toolPart('Edit', editInput('/f.ts', 'world', 'there')),
    ];
    const [summary] = collectFileSummaries(parts);
    expect(summary.lastOpKind).toBe('write');
    expect(summary.merged.oldValue).toBe('');
    expect(summary.merged.newValue).toBe('hello there\n');
    // Must NOT contain the raw Write content concatenated with the Edit's
    // own old/new snippets via the hunk separator — that was the bug.
    expect(summary.merged.newValue).not.toContain('next edit');
  });

  it('Edit, Write, Edit: edits before the last Write are dropped; edits after are applied', () => {
    const parts = [
      toolPart('Edit', editInput('/f.ts', 'irrelevant', 'noise')),
      toolPart('Write', writeInput('/f.ts', 'base content here\n')),
      toolPart('Edit', editInput('/f.ts', 'content', 'text')),
    ];
    const [summary] = collectFileSummaries(parts);
    expect(summary.lastOpKind).toBe('write');
    expect(summary.merged.oldValue).toBe('');
    expect(summary.merged.newValue).toBe('base text here\n');
  });

  it('all edits: still joins hunks for the multi-edit case', () => {
    const parts = [
      toolPart('Edit', editInput('/f.ts', 'a', 'b')),
      toolPart('Edit', editInput('/f.ts', 'c', 'd')),
    ];
    const [summary] = collectFileSummaries(parts);
    expect(summary.lastOpKind).toBe('edit');
    expect(summary.merged.oldValue).toBe('a\n\n// ─── next edit ───\n\nc');
    expect(summary.merged.newValue).toBe('b\n\n// ─── next edit ───\n\nd');
  });
});
