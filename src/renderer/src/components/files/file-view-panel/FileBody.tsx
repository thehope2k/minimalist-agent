import { CodeViewer, Spinner, ErrorMsg } from './CodeViewer';
import { JsonViewer } from './JsonViewer';
import { ImageViewer } from './ImageViewer';
import { MarkdownViewer, HtmlViewer } from './ContentViewers';
import { getMonacoLanguage } from './file-utils';
import type { ViewerType } from './types';

interface FileBodyProps {
  viewerType: ViewerType;
  absolutePath: string;
  filename: string;
  lineNumber: number;
  content: string | null;
  imageSrc: string;
  loading: boolean;
  error: string | null;
  showSource: boolean;
}

/** Routes loaded file content to the matching viewer. */
export function FileBody({
  viewerType,
  absolutePath,
  filename,
  lineNumber,
  content,
  imageSrc,
  loading,
  error,
  showSource,
}: FileBodyProps) {
  if (loading) return <Spinner />;
  if (error) return <ErrorMsg>{error}</ErrorMsg>;

  switch (viewerType) {
    case 'markdown':
      return <MarkdownViewer content={content ?? ''} showSource={showSource} />;
    case 'html':
      return <HtmlViewer content={content ?? ''} showSource={showSource} />;
    case 'image-raster':
    case 'image-svg':
      return <ImageViewer src={imageSrc} filename={filename} />;
    case 'json':
      return <JsonViewer raw={content ?? ''} />;
    default:
      return (
        <CodeViewer
          content={content ?? ''}
          language={getMonacoLanguage(absolutePath)}
          lineNumber={lineNumber}
        />
      );
  }
}
