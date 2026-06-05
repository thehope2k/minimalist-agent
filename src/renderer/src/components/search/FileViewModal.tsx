import { useMemo, useState } from 'react';
import { FileText, Code } from 'lucide-react';
import { CopyButton, CopyImageButton, ExpandModal } from '@/components/ui';
import { useFileContent } from './file-view-modal/useFileContent';
import { CodeViewer, Spinner, ErrorMsg } from './file-view-modal/CodeViewer';
import { JsonViewer } from './file-view-modal/JsonViewer';
import { ImageViewer } from './file-view-modal/ImageViewer';
import { MarkdownViewer, HtmlViewer } from './file-view-modal/ContentViewers';
import {
  getViewerType,
  getMimeType,
  getMonacoLanguage,
  basename,
} from './file-view-modal/file-utils';
import type { FileViewModalProps } from './file-view-modal/types';

/**
 * Full-screen file viewer — routes to markdown/HTML/JSON/image/code viewers.
 * Orchestrates file loading, viewer selection, and source/preview toggle.
 */
export function FileViewModal({
  absolutePath,
  lineNumber,
  onClose,
}: FileViewModalProps) {
  const viewerType = useMemo(() => getViewerType(absolutePath), [absolutePath]);
  const [showSource, setShowSource] = useState(false);

  const { content, base64, loading, error } = useFileContent(
    absolutePath,
    viewerType,
  );

  const filename = basename(absolutePath);
  const isImage =
    viewerType === 'image-raster' || viewerType === 'image-svg';
  const imageSrc = useMemo(() => {
    if (viewerType === 'image-raster') {
      return base64 ? `data:${getMimeType(absolutePath)};base64,${base64}` : '';
    }
    if (viewerType === 'image-svg') {
      return content
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
        : '';
    }
    return '';
  }, [viewerType, base64, content, absolutePath]);
  const canCopyText = !loading && !error && !isImage && content != null;
  const canCopyImage = !loading && !error && isImage && !!imageSrc;

  // Header
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

      {canCopyText && (
        <CopyButton text={content ?? ''} className="shrink-0 opacity-100" />
      )}
      {canCopyImage && (
        <CopyImageButton src={imageSrc} className="shrink-0 opacity-100" />
      )}

      {/* Source toggle for markdown and HTML */}
      {(viewerType === 'markdown' || viewerType === 'html') &&
        !loading &&
        !error && (
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

  // Body
  const body = (() => {
    if (loading) return <Spinner />;
    if (error) return <ErrorMsg>{error}</ErrorMsg>;

    if (viewerType === 'markdown') {
      return <MarkdownViewer content={content ?? ''} showSource={showSource} />;
    }

    if (viewerType === 'html') {
      return <HtmlViewer content={content ?? ''} showSource={showSource} />;
    }

    if (viewerType === 'image-raster' || viewerType === 'image-svg') {
      return <ImageViewer src={imageSrc} filename={filename} />;
    }

    if (viewerType === 'json') {
      return <JsonViewer raw={content ?? ''} />;
    }

    // Default: Monaco
    return (
      <CodeViewer
        content={content ?? ''}
        language={getMonacoLanguage(absolutePath)}
        lineNumber={lineNumber}
      />
    );
  })();

  return (
    <ExpandModal title={title} onClose={onClose} className="w-[95vw] h-[90vh]">
      {body}
    </ExpandModal>
  );
}
