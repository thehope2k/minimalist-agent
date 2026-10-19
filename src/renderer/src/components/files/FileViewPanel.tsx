import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Code, FileText, Maximize2, X } from 'lucide-react';
import { CopyButton, CopyImageButton, ExpandModal, IconButton } from '@/components/ui';
import { CwdContext } from '@/contexts/CwdContext';
import { FileOpenerProvider } from '@/contexts/FileOpenerContext';
import { useFileContent } from './file-view-panel/useFileContent';
import { FileBody } from './file-view-panel/FileBody';
import { getViewerType, getMimeType, basename, dirname } from './file-view-panel/file-utils';
import type { FileViewPanelProps } from './file-view-panel/types';

/**
 * File viewer for the right side panel (markdown/HTML/JSON/image/code).
 * The expand button re-hosts the same view in a full-screen modal.
 */
export function FileViewPanel({
  absolutePath,
  lineNumber,
  onClose,
  onBack,
  onOpenFile,
}: FileViewPanelProps) {
  const viewerType = useMemo(() => getViewerType(absolutePath), [absolutePath]);
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setShowSource(false), [absolutePath]);

  const { content, base64, loading, error } = useFileContent(absolutePath, viewerType);

  const filename = basename(absolutePath);
  const isImage = viewerType === 'image-raster' || viewerType === 'image-svg';
  const imageSrc = useMemo(() => {
    if (viewerType === 'image-raster') {
      return base64 ? `data:${getMimeType(absolutePath)};base64,${base64}` : '';
    }
    if (viewerType === 'image-svg') {
      return content ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}` : '';
    }
    return '';
  }, [viewerType, base64, content, absolutePath]);
  const canCopyText = !loading && !error && !isImage && content != null;
  const canCopyImage = !loading && !error && isImage && !!imageSrc;
  const canToggleSource =
    (viewerType === 'markdown' || viewerType === 'html') && !loading && !error;

  const actions = (
    <>
      {canCopyText && <CopyButton text={content ?? ''} className="shrink-0 opacity-100" />}
      {canCopyImage && <CopyImageButton src={imageSrc} className="shrink-0 opacity-100" />}
      {canToggleSource && (
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
    </>
  );

  const lineChip = viewerType === 'code' && lineNumber > 1 && (
    <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
      L{lineNumber}
    </span>
  );

  const body = (
    <FileBody
      // Monaco only scrolls to the line on mount, so a new target needs a fresh viewer.
      key={`${absolutePath}:${lineNumber}`}
      viewerType={viewerType}
      absolutePath={absolutePath}
      filename={filename}
      lineNumber={lineNumber}
      content={content}
      imageSrc={imageSrc}
      loading={loading}
      error={error}
      showSource={showSource}
    />
  );

  return (
    <CwdContext.Provider value={dirname(absolutePath)}>
      <FileOpenerProvider onOpenFile={onOpenFile}>
        {expanded ? (
          <ExpandModal
            onClose={() => setExpanded(false)}
            className="h-[90vh] w-[95vw]"
            title={
              <div className="flex w-full items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                <span className="text-sm font-medium text-fg">{filename}</span>
                <span className="text-fg-subtle">·</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
                  {absolutePath}
                </span>
                {lineChip}
                {actions}
              </div>
            }
          >
            {body}
          </ExpandModal>
        ) : (
          <div data-pet-avoid className="flex h-full flex-col bg-panel">
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-1.5">
              {onBack && <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />}
              <FileText className="ml-1.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-fg"
                title={absolutePath}
              >
                {filename}
              </span>
              {lineChip}
              {actions}
              <IconButton icon={Maximize2} label="Full screen" onClick={() => setExpanded(true)} />
              <IconButton icon={X} label="Close" onClick={onClose} />
            </div>
            {body}
          </div>
        )}
      </FileOpenerProvider>
    </CwdContext.Provider>
  );
}
