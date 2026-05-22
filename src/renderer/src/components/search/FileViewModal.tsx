// Full-screen file viewer — opened from Search Everywhere when the user
// picks any result.
//
// Viewer routing by extension:
//   .md / .mdx            → Markdown  — full chat renderer (remark-gfm,
//                           remark-math, rehype-katex, Shiki, Mermaid,
//                           JSON tree). Source toggle available.
//   .png / .jpg / .gif
//   .webp / .avif / .svg  → Image     — ZoomPan canvas with pan + scroll-
//                           to-zoom controls. SVG read as text; raster
//                           files read as base64.
//   .json / .jsonc        → JSON tree — @uiw/react-json-view, same
//                           component the chat uses. Falls back to Monaco
//                           for invalid JSON.
//   everything else       → Monaco    — read-only editor, jumps to
//                           `lineNumber` on mount (for grep results).

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { FileText, Loader2, Code } from 'lucide-react';
import JsonView from '@uiw/react-json-view';
import { vscodeTheme } from '@uiw/react-json-view/vscode';
import { ExpandModal, ZoomPan } from '@/components/ui';
import { Markdown } from '@/components/chat/parts/markdown/Markdown';
import { registerAppMonacoTheme } from '@/lib/monaco-setup';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default })),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileViewModalProps {
  absolutePath: string;
  /** 1-based line to scroll to (grep results). 1 = top. */
  lineNumber: number;
  onClose: () => void;
}

type ViewerType = 'markdown' | 'image-raster' | 'image-svg' | 'json' | 'code';

// ─── Extension → viewer map ───────────────────────────────────────────────────

const MD_EXTS    = new Set(['.md', '.mdx']);
const SVG_EXTS   = new Set(['.svg']);
const RASTER_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico']);
const JSON_EXTS  = new Set(['.json', '.jsonc']);

function getViewerType(path: string): ViewerType {
  const ext = extname(path).toLowerCase();
  if (MD_EXTS.has(ext))     return 'markdown';
  if (SVG_EXTS.has(ext))    return 'image-svg';
  if (RASTER_EXTS.has(ext)) return 'image-raster';
  if (JSON_EXTS.has(ext))   return 'json';
  return 'code';
}

function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  const MAP: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  };
  return MAP[ext] ?? 'image/png';
}

// ─── Monaco language map ──────────────────────────────────────────────────────

function getMonacoLanguage(path: string): string {
  const ext = extname(path).toLowerCase();
  const MAP: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.json': 'json', '.jsonc': 'json',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.html': 'html', '.htm': 'html', '.xml': 'xml', '.svg': 'xml',
    '.md': 'markdown', '.mdx': 'markdown',
    '.py': 'python', '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'ini', '.ini': 'ini', '.env': 'ini',
    '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
    '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.sql': 'sql',
    '.graphql': 'graphql', '.gql': 'graphql',
    '.dockerfile': 'dockerfile', '.tf': 'hcl', '.hcl': 'hcl',
  };
  return MAP[ext] ?? 'plaintext';
}

// ─── Path helpers (renderer can't use node:path) ─────────────────────────────

function basename(p: string): string { return p.split('/').pop() ?? p; }
function extname(p: string): string {
  const base = basename(p);
  const dot  = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

// ─── JSON theme (mirrors JsonBlock) ──────────────────────────────────────────

const JSON_THEME = {
  ...vscodeTheme,
  '--w-rjv-font-family': '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  '--w-rjv-font-size': '13px',
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-line-height': '1.7',
} as const;

// ─── Public component ─────────────────────────────────────────────────────────

export function FileViewModal({ absolutePath, lineNumber, onClose }: FileViewModalProps) {
  const viewerType = useMemo(() => getViewerType(absolutePath), [absolutePath]);

  const [content, setContent]     = useState<string | null>(null);
  const [base64, setBase64]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // Markdown source-toggle: when true, show raw Monaco instead of rendered view.
  const [showSource, setShowSource] = useState(false);

  // Load file data whenever the path changes.
  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);
    setBase64(null);
    setShowSource(false);

    if (viewerType === 'image-raster') {
      window.api.fs.readFileBase64(absolutePath)
        .then((b64) => { b64 ? setBase64(b64) : setError('File too large or unreadable.'); })
        .catch(() => setError('Failed to read image.'))
        .finally(() => setLoading(false));
    } else {
      window.api.fs.readFile(absolutePath)
        .then((text) => { text !== null ? setContent(text) : setError('File too large or unreadable.'); })
        .catch(() => setError('Failed to read file.'))
        .finally(() => setLoading(false));
    }
  }, [absolutePath, viewerType]);

  const filename = basename(absolutePath);

  // ── Header ────────────────────────────────────────────────────────────────
  const title = (
    <div className="flex w-full items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
        <span className="text-sm font-medium text-fg">{filename}</span>
        <span className="text-fg-subtle">·</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
          {absolutePath}
        </span>
        {viewerType === 'code' && lineNumber > 1 && (
          <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
            L{lineNumber}
          </span>
        )}
      </div>

      {/* Source toggle — only for markdown */}
      {viewerType === 'markdown' && !loading && !error && (
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          title={showSource ? 'Show rendered preview' : 'Show source'}
          className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          <Code className="h-3.5 w-3.5" strokeWidth={1.75} />
          {showSource ? 'Preview' : 'Source'}
        </button>
      )}
    </div>
  );

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = (() => {
    if (loading) return <Spinner />;
    if (error)   return <ErrorMsg>{error}</ErrorMsg>;

    // Markdown — use full chat renderer; Source button switches to Monaco
    if (viewerType === 'markdown') {
      if (showSource) {
        return <CodeViewer content={content ?? ''} language="markdown" lineNumber={1} />;
      }
      return (
        <div className="flex-1 min-h-0 overflow-y-auto px-10 py-8">
          <div className="mx-auto max-w-3xl">
            <Markdown text={content ?? ''} />
          </div>
        </div>
      );
    }

    // Raster images — base64 data URL inside ZoomPan
    if (viewerType === 'image-raster') {
      const src = `data:${getMimeType(absolutePath)};base64,${base64}`;
      return (
        <ZoomPan className="flex-1 min-h-0 bg-[#111116]" fitOnMount>
          <img src={src} alt={filename} draggable={false} className="max-w-none" />
        </ZoomPan>
      );
    }

    // SVG — text → data URI, same ZoomPan treatment
    if (viewerType === 'image-svg') {
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content ?? '')}`;
      return (
        <ZoomPan className="flex-1 min-h-0 bg-[#111116]" fitOnMount>
          <img src={src} alt={filename} draggable={false} className="max-w-none" />
        </ZoomPan>
      );
    }

    // JSON — interactive tree; falls back to Monaco for invalid JSON
    if (viewerType === 'json') {
      return <JsonViewer raw={content ?? ''} />;
    }

    // Default: Monaco read-only code editor
    return <CodeViewer content={content ?? ''} language={getMonacoLanguage(absolutePath)} lineNumber={lineNumber} />;
  })();

  return (
    <ExpandModal title={title} onClose={onClose} className="w-[95vw] h-[90vh]">
      {body}
    </ExpandModal>
  );
}

// ─── Sub-viewers ──────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-center text-xs text-fg-subtle">{children}</p>
    </div>
  );
}

// Monaco read-only editor — used for code files and markdown source view.
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
};

function CodeViewer({
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

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    if (lineNumber > 1) {
      setTimeout(() => { editor.revealLineInCenter(lineNumber); }, 80);
    }
  }, [lineNumber]);

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

// Interactive JSON tree — mirrors JsonBlock but without the chat chrome.
function JsonViewer({ raw }: { raw: string }) {
  const parsed = useMemo(() => {
    try { return JSON.parse(raw) as object; } catch { return null; }
  }, [raw]);

  // Invalid JSON → fall back to Monaco so the file is still readable.
  if (parsed === null) {
    return <CodeViewer content={raw} language="json" lineNumber={1} />;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 scroll-thin">
      <JsonView
        value={parsed}
        style={JSON_THEME}
        collapsed={2}
        enableClipboard
        displayDataTypes={false}
        shortenTextAfterLength={200}
      />
    </div>
  );
}
