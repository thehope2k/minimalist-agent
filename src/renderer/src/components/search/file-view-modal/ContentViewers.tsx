import { Markdown } from '@/components/chat/parts/markdown/Markdown';
import { CodeViewer } from './CodeViewer';

export function MarkdownViewer({
  content,
  showSource,
}: {
  content: string;
  showSource: boolean;
}) {
  if (showSource) {
    return <CodeViewer content={content} language="markdown" lineNumber={1} />;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-10 py-8">
      <div className="mx-auto max-w-3xl">
        <Markdown text={content} />
      </div>
    </div>
  );
}

export function HtmlViewer({
  content,
  showSource,
}: {
  content: string;
  showSource: boolean;
}) {
  if (showSource) {
    return <CodeViewer content={content} language="html" lineNumber={1} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
      <iframe
        srcDoc={content}
        sandbox="allow-same-origin"
        title="HTML Preview"
        className="h-full w-full flex-1 rounded border border-border bg-white"
      />
    </div>
  );
}
