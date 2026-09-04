// Used for Write tool results — no old content to diff, just show the
// written file with special rendering for markdown/JSON/images.

import { useState } from 'react';
import { Code } from 'lucide-react';
import { CopyButton } from '@/components/ui';
import { CodeBlock } from './markdown/CodeBlock';
import { Markdown } from './markdown/Markdown';
import { JsonBlock } from './markdown/JsonBlock';
import { langFromPath } from './diff-utils';

export function WrittenView({
  filePath,
  content,
  embedded = false,
}: {
  filePath: string;
  content: string;
  embedded?: boolean;
}) {
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-fg-muted transition-colors hover:text-fg"
            >
              <Code className="h-3 w-3" strokeWidth={1.75} />
              {showSource ? 'Preview' : 'Source'}
            </button>
            <CopyButton text={content} className="opacity-100" />
          </div>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-fg-muted transition-colors hover:text-fg"
            >
              <Code className="h-3 w-3" strokeWidth={1.75} />
              {showSource ? 'Preview' : 'Source'}
            </button>
            <CopyButton text={content} className="opacity-100" />
          </div>
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
        <JsonBlock code={content} embedded={embedded} />
      </div>
    );
  }

  // ── Default: syntax-highlighted code block ──
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-panel">
      <CodeBlock code={content} language={langFromPath(filePath)} embedded={embedded} />
    </div>
  );
}
