// Shared diff utilities used by both DiffPart (per-tool chip) and
// TurnSummaryCard (end-of-turn aggregate view).

import { lazy, Suspense, useState } from 'react';
import type { DiffMethod } from 'react-diff-viewer-continued';
import { FilePenLine, FileText, Code } from 'lucide-react';
import { ExpandModal } from '@/components/ui';
import { CodeBlock } from './markdown/CodeBlock';
import { Markdown } from './markdown/Markdown';
import { JsonBlock } from './markdown/JsonBlock';

// Lazy-loaded so react-diff-viewer-continued (~2.7 MB) stays out of the
// initial bundle. The viewer is only rendered when the user expands a diff
// chip or opens the split-view modal, so the deferred load is invisible.
export const LazyDiffViewer = lazy(() =>
  import('react-diff-viewer-continued').then((m) => ({ default: m.default }))
);

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

/**
 * Used for Write tool results — no old content to diff, just show the
 * written file with special rendering for markdown/JSON/images.
 */
export function WrittenView({ filePath, content }: { filePath: string; content: string }) {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const isMarkdown = ext === 'md' || ext === 'mdx';
  const isJson = ext === 'json' || ext === 'jsonc';
  const isHtml = ext === 'html' || ext === 'htm';

  const [showSource, setShowSource] = useState(false);

  // ── Markdown viewer with Preview/Source toggle ──
  if (isMarkdown) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-panel">
        {/* Header with toggle */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-fg-subtle">markdown</span>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-fg-muted transition-colors hover:text-fg"
          >
            <Code className="h-3 w-3" strokeWidth={1.75} />
            {showSource ? 'Preview' : 'Source'}
          </button>
        </div>

        {/* Content */}
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          {showSource ? (
            <pre className="m-0 overflow-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg">
              <code>{content}</code>
            </pre>
          ) : (
            <div className="px-6 py-4">
              <Markdown text={content} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── HTML viewer with Source/Preview toggle (sandboxed, safe to show preview) ──
  if (isHtml) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-panel">
        {/* Header with toggle */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-fg-subtle">html</span>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-fg-muted transition-colors hover:text-fg"
          >
            <Code className="h-3 w-3" strokeWidth={1.75} />
            {showSource ? 'Preview' : 'Source'}
          </button>
        </div>

        {/* Content */}
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          {showSource ? (
            <pre className="m-0 overflow-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg">
              <code>{content}</code>
            </pre>
          ) : (
            <div className="p-2">
              {/* Sandboxed iframe — blocks scripts, forms, popups, top navigation */}
              <iframe
                srcDoc={content}
                sandbox="allow-same-origin"
                title="HTML Preview"
                className="h-[min(65vh,760px)] min-h-[420px] w-full rounded border border-border/40 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── JSON viewer with interactive tree ──
  if (isJson) {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-panel">
        <JsonBlock code={content} />
      </div>
    );
  }

  // ── Default: syntax-highlighted code block ──
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-panel">
      <CodeBlock code={content} language={langFromPath(filePath)} />
    </div>
  );
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
      <div className="flex min-h-0 flex-1 flex-col bg-panel">
        {isWrite ? (
          <WrittenView filePath={parsed.filePath} content={parsed.newValue} />
        ) : (
          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<div className="h-16 animate-pulse rounded bg-elevated/40 m-4" />}>
              <LazyDiffViewer
                oldValue={parsed.oldValue}
                newValue={parsed.newValue}
                splitView={true}
                compareMethod={DIFF_METHOD_WORDS}
                useDarkTheme={true}
                styles={diffViewerStyles}
              />
            </Suspense>
          </div>
        )}
      </div>
    </ExpandModal>
  );
}

// Separator string used when joining multiple edit patches for the same file.
export const EDIT_SEP = '\n\n// ─── next edit ───\n\n';
