// Right panel of the git diff modal: Monaco DiffEditor.
// Lazy-loaded so the ~5 MB Monaco bundle doesn't block app startup.
//
// The custom theme derives its colors from the app's OKLCH design tokens
// (globals.css). Monaco can't consume CSS variables, so hex approximations
// are hard-coded here with clear derivation comments.

import { lazy, Suspense, useCallback, useRef } from 'react';
import type { DiffOnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import type { GitFileDiff } from './types';

// Lazy import keeps Monaco out of the initial bundle.
const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
);

interface GitDiffViewProps {
  diff: GitFileDiff | null;
  splitView: boolean;
}

// Hex approximations of the app's OKLCH design tokens (globals.css).
// These are unavoidable — Monaco's theming API doesn't accept CSS variables.
//   --panel      oklch(0.13 0.004 270)  ≈ #1b1b21
//   --background oklch(0.07 0.004 270)  ≈ #0e0e12
//   --elevated   oklch(0.22 0.004 270)  ≈ #313139
//   --fg         oklch(0.97 0.003 270)  ≈ #f5f5f7
//   --fg-muted   oklch(0.74 0.004 270)  ≈ #bcbcc3
//   --fg-subtle  oklch(0.60 0.004 270)  ≈ #939399
//   --border     fg/16%                 ≈ #2d2d33
const THEME_COLORS = {
  // Darker than --panel (#1b1b21) so the code surface is visually distinct
  // from the modal chrome and diff highlights pop more against the deep base.
  editorBg: '#111116',
  gutterBg: '#0d0d11',
  fg: '#f5f5f7',
  fgMuted: '#bcbcc3',
  fgSubtle: '#939399',
  border: '#2d2d33',
  // Diff line backgrounds — solid colors, not translucent blends.
  // Calibrated to match IntelliJ Darcula's contrast level: clearly visible
  // bands without being garish. Editor bg is #1b1b21 (L=0.13), these sit
  // at L≈0.20–0.22 with hue shift, giving a readable but not harsh tint.
  addedBg: '#1a3828',           // deep green band
  removedBg: '#38201e',         // deep red band
  wordAddedBg: '#2a5438',       // stronger green for word-level changes
  wordRemovedBg: '#562828',     // stronger red for word-level changes
  addedGutter: '#163022',       // green-tinted gutter strip
  removedGutter: '#301919',     // red-tinted gutter strip
} as const;

function defineAppTheme(monaco: typeof MonacoType) {
  monaco.editor.defineTheme('minimalist-dark', {
    base: 'vs-dark',
    inherit: true,
    // Token color rules — modelled after VS Code Dark+ to get the same
    // semantic richness: methods yellow, variables light-blue, types teal,
    // keywords blue/purple. These apply on top of the TypeScript worker's
    // semantic tokens and the base TextMate grammar fallback.
    rules: [
      { token: 'keyword',                          foreground: '569CD6' },
      { token: 'keyword.control',                  foreground: 'C586C0' },
      { token: 'keyword.operator',                 foreground: '569CD6' },
      { token: 'storage.type',                     foreground: '569CD6' },
      { token: 'entity.name.function',             foreground: 'DCDCAA' },
      { token: 'support.function',                 foreground: 'DCDCAA' },
      { token: 'entity.name.type',                 foreground: '4EC9B0' },
      { token: 'entity.name.class',                foreground: '4EC9B0' },
      { token: 'support.class',                    foreground: '4EC9B0' },
      { token: 'variable',                         foreground: '9CDCFE' },
      { token: 'variable.other.readwrite',         foreground: '9CDCFE' },
      { token: 'variable.other.object',            foreground: '9CDCFE' },
      { token: 'variable.parameter',               foreground: '9CDCFE' },
      { token: 'constant.numeric',                 foreground: 'B5CEA8' },
      { token: 'constant.language',                foreground: '569CD6' },
      { token: 'string',                           foreground: 'CE9178' },
      { token: 'comment',                          foreground: '6A9955', fontStyle: 'italic' },
      { token: 'punctuation.definition',           foreground: 'D4D4D4' },
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
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 18,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderSideBySide: true,      // overridden by splitView prop via onMount
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  originalEditable: false,
};

export function GitDiffView({ diff, splitView }: GitDiffViewProps) {
  const editorRef = useRef<MonacoType.editor.IStandaloneDiffEditor | null>(null);

  const handleBeforeMount = useCallback((monaco: typeof MonacoType) => {
    defineAppTheme(monaco);
  }, []);

  const handleMount: DiffOnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      editor.updateOptions({ renderSideBySide: splitView });

      // Scroll to the first diff hunk whenever Monaco finishes computing
      // the diff (fires once after content is set, not on every keystroke).
      editor.onDidUpdateDiff(() => {
        const changes = editor.getLineChanges();
        if (changes && changes.length > 0) {
          editor.getModifiedEditor().revealLineInCenter(
            changes[0].modifiedStartLineNumber,
          );
        }
      });
    },
    [splitView],
  );

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
