// Configure Monaco to use locally bundled workers instead of CDN.
// Must be imported before any Monaco or @monaco-editor/react usage.
//
// Only the base editor worker is registered. Language-specific workers
// (TypeScript, JSON, CSS) require proper file:// model URIs to activate
// semantic highlighting — the DiffEditor uses anonymous models so they
// provide no benefit and add bundle weight unnecessarily.
//
// registerAppMonacoTheme() is the single source of truth for the
// `minimalist-dark` theme. Call it inside beforeMount / onMount of any
// Monaco component. It is idempotent — safe to call multiple times.

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import type * as MonacoType from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

(self as unknown as Record<string, unknown>).MonacoEnvironment = {
  getWorker(_moduleId: string, _label: string) {
    return new editorWorker();
  },
};

loader.config({ monaco });

// ─── Shared theme ─────────────────────────────────────────────────────────────
// Hex approximations of the app's OKLCH design tokens (globals.css).
//   --panel      oklch(0.13 0.004 270)  ≈ #1b1b21
//   --background oklch(0.07 0.004 270)  ≈ #0e0e12
//   --elevated   oklch(0.22 0.004 270)  ≈ #313139
//   --fg         oklch(0.97 0.003 270)  ≈ #f5f5f7
//   --fg-muted   oklch(0.74 0.004 270)  ≈ #bcbcc3
//   --fg-subtle  oklch(0.60 0.004 270)  ≈ #939399
//   --border     fg/16%                 ≈ #2d2d33
export const APP_MONACO_COLORS = {
  editorBg:      '#111116',
  gutterBg:      '#0d0d11',
  fg:            '#f5f5f7',
  fgMuted:       '#bcbcc3',
  fgSubtle:      '#939399',
  border:        '#2d2d33',
  addedBg:       '#1a3828',
  removedBg:     '#38201e',
  wordAddedBg:   '#2a5438',
  wordRemovedBg: '#562828',
  addedGutter:   '#163022',
  removedGutter: '#301919',
} as const;

/**
 * Register the shared `minimalist-dark` Monaco theme.
 * Idempotent — safe to call inside multiple components' beforeMount callbacks.
 */
export function registerAppMonacoTheme(m: typeof MonacoType): void {
  m.editor.defineTheme('minimalist-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',                  foreground: '569CD6' },
      { token: 'keyword.control',          foreground: 'C586C0' },
      { token: 'keyword.operator',         foreground: '569CD6' },
      { token: 'storage.type',             foreground: '569CD6' },
      { token: 'entity.name.function',     foreground: 'DCDCAA' },
      { token: 'support.function',         foreground: 'DCDCAA' },
      { token: 'entity.name.type',         foreground: '4EC9B0' },
      { token: 'entity.name.class',        foreground: '4EC9B0' },
      { token: 'support.class',            foreground: '4EC9B0' },
      { token: 'variable',                 foreground: '9CDCFE' },
      { token: 'variable.other.readwrite', foreground: '9CDCFE' },
      { token: 'variable.other.object',    foreground: '9CDCFE' },
      { token: 'variable.parameter',       foreground: '9CDCFE' },
      { token: 'constant.numeric',         foreground: 'B5CEA8' },
      { token: 'constant.language',        foreground: '569CD6' },
      { token: 'string',                   foreground: 'CE9178' },
      { token: 'comment',                  foreground: '6A9955', fontStyle: 'italic' },
      { token: 'punctuation.definition',   foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background':                       APP_MONACO_COLORS.editorBg,
      'editor.foreground':                       APP_MONACO_COLORS.fg,
      'editorLineNumber.foreground':             APP_MONACO_COLORS.fgSubtle,
      'editorLineNumber.activeForeground':       APP_MONACO_COLORS.fgMuted,
      'editor.lineHighlightBackground':          APP_MONACO_COLORS.editorBg,
      'editorGutter.background':                 APP_MONACO_COLORS.gutterBg,
      'diffEditor.insertedTextBackground':       APP_MONACO_COLORS.wordAddedBg,
      'diffEditor.removedTextBackground':        APP_MONACO_COLORS.wordRemovedBg,
      'diffEditor.insertedLineBackground':       APP_MONACO_COLORS.addedBg,
      'diffEditor.removedLineBackground':        APP_MONACO_COLORS.removedBg,
      'diffEditorGutter.insertedLineBackground': APP_MONACO_COLORS.addedGutter,
      'diffEditorGutter.removedLineBackground':  APP_MONACO_COLORS.removedGutter,
      'scrollbarSlider.background':              '#ffffff18',
      'scrollbarSlider.hoverBackground':         '#ffffff28',
    },
  });
}
