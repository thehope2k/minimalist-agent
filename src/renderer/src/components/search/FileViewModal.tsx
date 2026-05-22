// Full-screen read-only Monaco file viewer.
//
// Opened from SearchModal when the user selects any result (file or grep match).
// Uses ExpandModal as its shell — Esc / backdrop click / X all close it.
// Jumps to `lineNumber` on mount so grep-match results land at the right spot.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { FileText, Loader2 } from 'lucide-react';
import { ExpandModal } from '@/components/ui';
import { registerAppMonacoTheme } from '@/lib/monaco-setup';
// Simple path helpers — the renderer can't use node:path directly.
function basename(p: string): string {
  return p.split('/').pop() ?? p;
}
function extname(p: string): string {
  const base = basename(p);
  const dot  = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

// Lazy import keeps Monaco out of the initial bundle.
const Editor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default })),
);

export interface FileViewModalProps {
  absolutePath: string;
  /** 1-based line to scroll to on open (1 = top). */
  lineNumber: number;
  onClose: () => void;
}

const EDITOR_OPTIONS: MonacoType.editor.IStandaloneEditorConstructionOptions = {
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
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

export function FileViewModal({ absolutePath, lineNumber, onClose }: FileViewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);

  // Load file content via IPC.
  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);
    window.api.fs.readFile(absolutePath)
      .then((text) => {
        if (text === null) setError('File too large or unreadable.');
        else setContent(text);
      })
      .catch(() => setError('Failed to read file.'))
      .finally(() => setLoading(false));
  }, [absolutePath]);

  const handleBeforeMount = useCallback((monaco: typeof MonacoType) => {
    registerAppMonacoTheme(monaco);
  }, []);

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    if (lineNumber > 1) {
      // Small defer so Monaco has painted the viewport before we scroll.
      setTimeout(() => {
        editor.revealLineInCenter(lineNumber);
      }, 80);
    }
  }, [lineNumber]);

  const filename = basename(absolutePath);
  const lang     = getMonacoLanguage(absolutePath);

  const title = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <FileText className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
      <span className="text-sm font-medium text-fg">{filename}</span>
      <span className="text-fg-subtle">·</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
        {absolutePath}
      </span>
      {lineNumber > 1 && (
        <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
          L{lineNumber}
        </span>
      )}
    </div>
  );

  return (
    <ExpandModal title={title} onClose={onClose} className="w-[95vw] h-[90vh]">
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-center text-xs text-fg-subtle">{error}</p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
              </div>
            }
          >
            <Editor
              value={content ?? ''}
              language={lang}
              theme="minimalist-dark"
              options={EDITOR_OPTIONS}
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
        )}
      </div>
    </ExpandModal>
  );
}

// ─── Language detection ───────────────────────────────────────────────────────

function getMonacoLanguage(absolutePath: string): string {
  const ext = extname(absolutePath).toLowerCase();
  const MAP: Record<string, string> = {
    '.ts':       'typescript',
    '.tsx':      'typescript',
    '.mts':      'typescript',
    '.cts':      'typescript',
    '.js':       'javascript',
    '.jsx':      'javascript',
    '.mjs':      'javascript',
    '.cjs':      'javascript',
    '.json':     'json',
    '.jsonc':    'json',
    '.css':      'css',
    '.scss':     'scss',
    '.less':     'less',
    '.html':     'html',
    '.htm':      'html',
    '.xml':      'xml',
    '.svg':      'xml',
    '.md':       'markdown',
    '.mdx':      'markdown',
    '.py':       'python',
    '.sh':       'shell',
    '.bash':     'shell',
    '.zsh':      'shell',
    '.fish':     'shell',
    '.yaml':     'yaml',
    '.yml':      'yaml',
    '.toml':     'ini',
    '.ini':      'ini',
    '.env':      'ini',
    '.rs':       'rust',
    '.go':       'go',
    '.java':     'java',
    '.kt':       'kotlin',
    '.swift':    'swift',
    '.c':        'c',
    '.h':        'c',
    '.cpp':      'cpp',
    '.cc':       'cpp',
    '.hpp':      'cpp',
    '.cs':       'csharp',
    '.rb':       'ruby',
    '.php':      'php',
    '.sql':      'sql',
    '.graphql':  'graphql',
    '.gql':      'graphql',
    '.dockerfile': 'dockerfile',
    '.tf':       'hcl',
    '.hcl':      'hcl',
  };
  return MAP[ext] ?? 'plaintext';
}
