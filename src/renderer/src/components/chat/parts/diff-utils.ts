// Pure diff utilities used by both DiffPart (per-tool chip) and
// TurnSummaryCard (end-of-turn aggregate view). No React/JSX here —
// see WrittenView.tsx and DiffExpandModal.tsx for the UI pieces.

import type { DiffMethod } from 'react-diff-viewer-continued';

// DiffMethod.WORDS = 'diffWords' — inlined to avoid importing the full package.
// Cast via `import type` (erased at runtime — zero bundle cost).
export const DIFF_METHOD_WORDS = 'diffWords' as unknown as DiffMethod;

// Derive a Shiki language tag from a file path extension.
export function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const MAP: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
    java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    html: 'html', css: 'css', scss: 'scss',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'md', mdx: 'mdx', sh: 'bash', bash: 'bash',
    sql: 'sql', graphql: 'graphql', xml: 'xml',
    dockerfile: 'dockerfile', tf: 'hcl',
  };
  return MAP[ext] ?? 'text';
}

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

  const oldLines = toLines(oldValue);
  const newLines = toLines(newValue);

  if (oldLines.length === 0) return { additions: newLines.length, deletions: 0 };
  if (newLines.length === 0) return { additions: 0, deletions: oldLines.length };

  return countLineEditsMyers(oldLines, newLines);
}

function countLineEditsMyers(
  oldLines: string[],
  newLines: string[],
): { additions: number; deletions: number } {
  const n = oldLines.length;
  const m = newLines.length;
  const max = n + m;

  // Frontier map for Myers O(ND) diff.
  // k = x - y, value = furthest x reached on that diagonal.
  let v = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];

  for (let d = 0; d <= max; d++) {
    const next = new Map<number, number>();

    for (let k = -d; k <= d; k += 2) {
      const moveDown =
        k === -d || (k !== d && (v.get(k - 1) ?? -Infinity) < (v.get(k + 1) ?? -Infinity));

      let x = moveDown ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;

      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x += 1;
        y += 1;
      }

      next.set(k, x);

      if (x >= n && y >= m) {
        trace.push(next);
        return backtrackLineEditCounts(trace, oldLines, newLines);
      }
    }

    trace.push(next);
    v = next;
  }

  // Unreachable in practice; keep a safe fallback.
  return { additions: newLines.length, deletions: oldLines.length };
}

function backtrackLineEditCounts(
  trace: Array<Map<number, number>>,
  oldLines: string[],
  newLines: string[],
): { additions: number; deletions: number } {
  let x = oldLines.length;
  let y = newLines.length;
  let additions = 0;
  let deletions = 0;

  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1];
    const k = x - y;

    const moveDown =
      k === -d || (k !== d && (prev.get(k - 1) ?? -Infinity) < (prev.get(k + 1) ?? -Infinity));

    const prevK = moveDown ? k + 1 : k - 1;
    const prevX = prev.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    // Walk back through unchanged lines (diagonal moves).
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
    }

    // Then account for the edit step that moved between diagonals.
    if (x === prevX) {
      if (y > 0) {
        additions += 1;
        y -= 1;
      }
    } else if (x > 0) {
      deletions += 1;
      x -= 1;
    }
  }

  return { additions, deletions };
}

function toLines(s: string): string[] {
  if (!s) return [];
  const trimmed = s.endsWith('\n') ? s.slice(0, -1) : s;
  if (!trimmed) return [];
  return trimmed.split('\n');
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

// Separator string used when joining multiple edit patches for the same file.
export const EDIT_SEP = '\n\n// ─── next edit ───\n\n';
