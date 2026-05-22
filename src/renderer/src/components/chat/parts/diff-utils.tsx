// Shared diff utilities used by both DiffPart (per-tool chip) and
// TurnSummaryCard (end-of-turn aggregate view).

import { DiffMethod } from 'react-diff-viewer-continued';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { FilePenLine, FileText } from 'lucide-react';
import { ExpandModal } from '@/components/ui';

export interface ParsedDiff {
  filePath: string;
  oldValue: string;
  newValue: string;
}

export function parseDiffInput(name: string, input: unknown): ParsedDiff | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const filePath = typeof o.file_path === 'string' ? o.file_path : '';
  if (!filePath) return null;

  if (name.toLowerCase() === 'write') {
    const content = typeof o.content === 'string' ? o.content : '';
    return { filePath, oldValue: '', newValue: content };
  }

  // Edit — Claude Code SDK uses top-level old_string / new_string (single pair).
  // Pi SDK uses an edits[] array of { oldText, newText } replacements.
  if (Array.isArray(o.edits) && o.edits.length > 0) {
    const edits = o.edits as Array<{ oldText?: unknown; newText?: unknown }>;
    const SEP = '\n\n// ─── next edit ───\n\n';
    const oldValue = edits.map((e) => (typeof e.oldText === 'string' ? e.oldText : '')).join(SEP);
    const newValue = edits.map((e) => (typeof e.newText === 'string' ? e.newText : '')).join(SEP);
    if (!oldValue && !newValue) return null;
    return { filePath, oldValue, newValue };
  }

  // Claude Code flat format
  const oldValue = typeof o.old_string === 'string' ? o.old_string : '';
  const newValue = typeof o.new_string === 'string' ? o.new_string : '';
  if (!oldValue && !newValue) return null;
  return { filePath, oldValue, newValue };
}

export function countDiffLines(
  oldValue: string,
  newValue: string,
): { additions: number; deletions: number } {
  if (oldValue === newValue) return { additions: 0, deletions: 0 };
  if (!oldValue) return { additions: countLines(newValue), deletions: 0 };
  if (!newValue) return { additions: 0, deletions: countLines(oldValue) };
  return { additions: countLines(newValue), deletions: countLines(oldValue) };
}

function countLines(s: string): number {
  if (!s) return 0;
  const trimmed = s.endsWith('\n') ? s.slice(0, -1) : s;
  if (!trimmed) return 0;
  return trimmed.split('\n').length;
}

export function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, '~/');
}

export function stripErrorWrapper(s: string): string {
  const m = s.match(/^\s*<tool_use_error>([\s\S]*?)<\/tool_use_error>\s*$/);
  return (m ? m[1] : s).trim();
}

// Theme aligned with our OKLCH tokens. Shared so both DiffPart and
// TurnSummaryCard render with identical styling.
export const diffViewerStyles = {
  variables: {
    dark: {
      diffViewerBackground: 'transparent',
      diffViewerColor: 'var(--fg)',
      addedBackground: 'rgba(16, 185, 129, 0.12)',
      addedColor: 'var(--fg)',
      removedBackground: 'rgba(239, 68, 68, 0.12)',
      removedColor: 'var(--fg)',
      wordAddedBackground: 'rgba(16, 185, 129, 0.32)',
      wordRemovedBackground: 'rgba(239, 68, 68, 0.32)',
      addedGutterBackground: 'rgba(16, 185, 129, 0.18)',
      removedGutterBackground: 'rgba(239, 68, 68, 0.18)',
      gutterBackground: 'transparent',
      gutterBackgroundDark: 'transparent',
      highlightBackground: 'transparent',
      highlightGutterBackground: 'transparent',
      codeFoldGutterBackground: 'transparent',
      codeFoldBackground: 'transparent',
      emptyLineBackground: 'transparent',
      gutterColor: 'var(--fg-subtle)',
      addedGutterColor: 'var(--fg-subtle)',
      removedGutterColor: 'var(--fg-subtle)',
      codeFoldContentColor: 'var(--fg-subtle)',
      diffViewerTitleBackground: 'transparent',
      diffViewerTitleColor: 'var(--fg-muted)',
      diffViewerTitleBorderColor: 'var(--border)',
    },
  },
  contentText: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '11px',
    lineHeight: '1.5',
  },
  gutter: {
    minWidth: '2.25rem',
    padding: '0 0.5rem',
    fontSize: '10px',
  },
  line: {
    wordBreak: 'break-word' as const,
  },
} as const;

// Shared split-view modal — used by both DiffPart and TurnSummaryCard.
export function DiffExpandModal({
  parsed,
  name,
  onClose,
}: {
  parsed: ParsedDiff;
  name: string;
  onClose: () => void;
}) {
  const isWrite = name.toLowerCase() === 'write';
  const Icon = isWrite ? FileText : FilePenLine;

  const title = (
    <>
      <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} />
      <span className="text-sm font-medium text-fg">{name}</span>
      <span className="text-fg-subtle">·</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
        {shortenPath(parsed.filePath)}
      </span>
    </>
  );

  return (
    <ExpandModal title={title} onClose={onClose} className="max-w-6xl">
      <div className="scroll-thin flex-1 overflow-auto bg-panel">
        <ReactDiffViewer
          oldValue={parsed.oldValue}
          newValue={parsed.newValue}
          splitView={true}
          compareMethod={DiffMethod.WORDS}
          useDarkTheme={true}
          styles={diffViewerStyles}
        />
      </div>
    </ExpandModal>
  );
}

// Separator string used when joining multiple edit patches for the same file.
export const EDIT_SEP = '\n\n// ─── next edit ───\n\n';
