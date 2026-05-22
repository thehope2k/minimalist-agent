// Right panel of the git diff modal: Monaco DiffEditor.
// Lazy-loaded so the ~5 MB Monaco bundle doesn't block app startup.
//
// Hunk staging: each diff hunk gets a glyph margin icon (left side of
// the modified editor — visually the "center" of the split view).
// Clicking the glyph toggles that hunk in/out of the commit.
// CSS classes git-hunk-checked / git-hunk-unchecked defined in globals.css.

import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import type { DiffOnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import type { GitFileDiff, LineChange } from './types';

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
);

interface GitDiffViewProps {
  diff: GitFileDiff | null;
  splitView: boolean;
  changes: LineChange[];
  stagedHunks: Set<number> | undefined;
  onToggleHunk: (index: number) => void;
  onDiffComputed?: (changes: LineChange[]) => void;
  /** Forces a clean Monaco remount when the file changes (prevents TextModel disposed race). */
  fileKey?: string;
}

const THEME_COLORS = {
  editorBg: '#111116',
  gutterBg: '#0d0d11',
  fg: '#f5f5f7',
  fgMuted: '#bcbcc3',
  fgSubtle: '#939399',
  border: '#2d2d33',
  addedBg: '#1a3828',
  removedBg: '#38201e',
  wordAddedBg: '#2a5438',
  wordRemovedBg: '#562828',
  addedGutter: '#163022',
  removedGutter: '#301919',
} as const;

function defineAppTheme(monaco: typeof MonacoType) {
  monaco.editor.defineTheme('minimalist-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',                 foreground: '569CD6' },
      { token: 'keyword.control',         foreground: 'C586C0' },
      { token: 'keyword.operator',        foreground: '569CD6' },
      { token: 'storage.type',            foreground: '569CD6' },
      { token: 'entity.name.function',    foreground: 'DCDCAA' },
      { token: 'support.function',        foreground: 'DCDCAA' },
      { token: 'entity.name.type',        foreground: '4EC9B0' },
      { token: 'entity.name.class',       foreground: '4EC9B0' },
      { token: 'support.class',           foreground: '4EC9B0' },
      { token: 'variable',                foreground: '9CDCFE' },
      { token: 'variable.other.readwrite',foreground: '9CDCFE' },
      { token: 'variable.other.object',   foreground: '9CDCFE' },
      { token: 'variable.parameter',      foreground: '9CDCFE' },
      { token: 'constant.numeric',        foreground: 'B5CEA8' },
      { token: 'constant.language',       foreground: '569CD6' },
      { token: 'string',                  foreground: 'CE9178' },
      { token: 'comment',                 foreground: '6A9955', fontStyle: 'italic' },
      { token: 'punctuation.definition',  foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': THEME_COLORS.editorBg,
      'editor.foreground': THEME_COLORS.fg,
      'editorLineNumber.foreground': THEME_COLORS.fgSubtle,
      'editorLineNumber.activeForeground': THEME_COLORS.fgMuted,
      'editor.lineHighlightBackground': THEME_COLORS.editorBg,
      'editorGutter.background': THEME_COLORS.gutterBg,
      'diffEditor.insertedTextBackground': THEME_COLORS.wordAddedBg,
      'diffEditor.removedTextBackground': THEME_COLORS.wordRemovedBg,
      'diffEditor.insertedLineBackground': THEME_COLORS.addedBg,
      'diffEditor.removedLineBackground': THEME_COLORS.removedBg,
      'diffEditorGutter.insertedLineBackground': THEME_COLORS.addedGutter,
      'diffEditorGutter.removedLineBackground': THEME_COLORS.removedGutter,
      'scrollbarSlider.background': '#ffffff18',
      'scrollbarSlider.hoverBackground': '#ffffff28',
    },
  });
}

const EDITOR_OPTIONS: MonacoType.editor.IDiffEditorConstructionOptions = {
  readOnly: true,
  originalEditable: false,
  glyphMargin: true,         // enables the glyph column for hunk checkboxes
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
};

export function GitDiffView({
  diff,
  splitView,
  changes,
  stagedHunks,
  onToggleHunk,
  onDiffComputed,
  fileKey,
}: GitDiffViewProps) {
  const editorRef  = useRef<MonacoType.editor.IStandaloneDiffEditor | null>(null);
  const monacoRef  = useRef<typeof MonacoType | null>(null);
  const decoRef    = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
  // Stable refs — avoids stale closures inside Monaco event handlers.
  const onDiffComputedRef = useRef(onDiffComputed);
  const onToggleHunkRef   = useRef(onToggleHunk);
  const changesRef        = useRef(changes);
  onDiffComputedRef.current = onDiffComputed;
  onToggleHunkRef.current   = onToggleHunk;
  changesRef.current        = changes;

  // Rebuild glyph decorations whenever changes or staging state updates.
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const col    = decoRef.current;
    if (!monaco || !editor || !col || changes.length === 0) {
      col?.clear();
      return;
    }
    const modEditor = editor.getModifiedEditor();
    const model     = modEditor.getModel();
    if (!model) return;

    const allStaged = stagedHunks === undefined;
    const decorations: MonacoType.editor.IModelDeltaDecoration[] = changes.map((c, i) => {
      // For pure deletions (modEnd=0), use the anchor line in modified.
      const line    = c.modifiedStartLineNumber || 1;
      const endLine = c.modifiedEndLineNumber > 0 ? c.modifiedEndLineNumber : line;
      const staged  = allStaged || stagedHunks.has(i);
      return {
        range: new monaco.Range(line, 1, line, 1),  // first line only — one icon per hunk
        options: {
          glyphMarginClassName: staged ? 'git-hunk-checked' : 'git-hunk-unchecked',
          glyphMarginHoverMessage: {
            value: staged ? '**Click** to exclude from commit' : '**Click** to include in commit',
          },
        },
      };
    });
    col.set(decorations);
  }, [changes, stagedHunks]);

  const handleBeforeMount = useCallback((monaco: typeof MonacoType) => {
    monacoRef.current = monaco;
    defineAppTheme(monaco);
  }, []);

  const handleMount: DiffOnMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.updateOptions({ renderSideBySide: splitView });

    const modEditor = editor.getModifiedEditor();

    // Create the decoration collection once on mount.
    decoRef.current = modEditor.createDecorationsCollection([]);

    // Glyph margin click — find which hunk the clicked line belongs to.
    modEditor.onMouseDown((e) => {
      if (
        monacoRef.current &&
        e.target.type === monacoRef.current.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      ) {
        const lineNum = e.target.position?.lineNumber;
        if (lineNum == null) return;
        const idx = changesRef.current.findIndex((c) => {
          const start = c.modifiedStartLineNumber || 1;
          const end   = c.modifiedEndLineNumber > 0 ? c.modifiedEndLineNumber : start;
          return lineNum >= start && lineNum <= end;
        });
        if (idx >= 0) onToggleHunkRef.current(idx);
      }
    });

    // Fire onDiffComputed + scroll to first hunk each time Monaco recomputes.
    editor.onDidUpdateDiff(() => {
      const cs = editor.getLineChanges();
      if (!cs) return;
      onDiffComputedRef.current?.(cs);
      if (cs.length > 0) {
        const firstLine = cs[0].modifiedEndLineNumber === 0
          ? cs[0].originalStartLineNumber
          : cs[0].modifiedStartLineNumber;
        modEditor.revealLineInCenter(firstLine);
      }
    });
  }, [splitView]);

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-fg-subtle">Select a file to view changes</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
        </div>
      }
    >
      <DiffEditor
        original={diff.original}
        modified={diff.modified}
        language={diff.language}
        theme="minimalist-dark"
        options={{ ...EDITOR_OPTIONS, renderSideBySide: splitView }}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        height="100%"
        loading={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
          </div>
        }
      />
    </Suspense>
  );
}
