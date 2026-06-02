import type { ConflictContent, GitFileEntry } from '../types';
import type * as MonacoType from 'monaco-editor';
import type { Root } from 'react-dom/client';

export interface ConflictViewProps {
  file: GitFileEntry;
  onResolved: () => void;
}

export interface WidgetEntry {
  widget: MonacoType.editor.IContentWidget;
  root: Root;
  lineRef: { current: number };
}

export const SHARED_OPTIONS: MonacoType.editor.IDiffEditorConstructionOptions = {
  readOnly: true,
  originalEditable: false,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  quickSuggestions: false,
};

export const RESULT_OPTIONS: MonacoType.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  lineNumbers: 'on',
  quickSuggestions: false,
};
