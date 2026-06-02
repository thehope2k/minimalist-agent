import { lazy, Suspense, useCallback, useRef } from 'react';
import type { OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import { registerAppMonacoTheme } from '@/lib/monaco-setup';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default })),
);

const MONACO_OPTIONS: MonacoType.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderLineHighlight: 'all',
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  renderWhitespace: 'none',
  folding: false,
  contextmenu: false,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  quickSuggestions: false,
};

export function CodeViewer({
  content,
  language,
  lineNumber,
}: {
  content: string;
  language: string;
  lineNumber: number;
}) {
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);

  const handleBeforeMount = useCallback((monaco: typeof MonacoType) => {
    registerAppMonacoTheme(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      editor.focus();
      if (lineNumber > 1) {
        setTimeout(() => {
          editor.revealLineInCenter(lineNumber);
        }, 80);
      }
    },
    [lineNumber],
  );

  return (
    <Suspense fallback={<Spinner />}>
      <div className="flex-1 min-h-0 overflow-hidden">
        <MonacoEditor
          value={content}
          language={language}
          theme="minimalist-dark"
          options={MONACO_OPTIONS}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          height="100%"
          loading={<Spinner />}
        />
      </div>
    </Suspense>
  );
}

export function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
    </div>
  );
}

export function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-center text-xs text-fg-subtle">{children}</p>
    </div>
  );
}
