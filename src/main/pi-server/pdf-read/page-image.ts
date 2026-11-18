import type { ImageContent } from '@earendil-works/pi-ai';
import { resizeImage, type ReadToolOptions } from '@earendil-works/pi-coding-agent';
import { renderPageAsImage } from 'unpdf';
import { createLogger } from '../../../shared/sub-logger';
import type { PdfDocument } from './pdf-document';

const log = createLogger('pdf-read');

// Long edge most vision models keep without downscaling; sharper only costs tokens.
const RENDER_LONG_EDGE_PX = 1568;
const PNG_MIME = 'image/png';

type ImageResizeOptions = ReadToolOptions['resizeOptions'];
type CanvasModule = typeof import('@napi-rs/canvas');

export type PageImageResult = { ok: true; image: ImageContent } | { ok: false; reason: string };
export type RenderingSupport = { ok: true } | { ok: false; reason: string };

let canvasModule: Promise<CanvasModule> | undefined;
let renderingSupport: Promise<RenderingSupport> | undefined;

// Imported lazily: @napi-rs/canvas is a per-platform native binary that a build
// can lack (e.g. an x64 mac build packaged on arm64). Without it, reads fall back
// to text instead of failing.
function loadCanvas(): Promise<CanvasModule> {
  canvasModule ??= import('@napi-rs/canvas');
  return canvasModule;
}

export function probePageRendering(): Promise<RenderingSupport> {
  renderingSupport ??= loadCanvas().then(
    (): RenderingSupport => ({ ok: true }),
    (error: unknown): RenderingSupport => {
      log.warn('PDF page rendering unavailable; reading text only', error);
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    },
  );
  return renderingSupport;
}

export async function renderPageImage(
  pdf: PdfDocument,
  pageNumber: number,
  resizeOptions: ImageResizeOptions,
): Promise<PageImageResult> {
  const page = await pdf.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  const png = await renderPageAsImage(pdf, pageNumber, {
    canvasImport: loadCanvas,
    scale: RENDER_LONG_EDGE_PX / Math.max(width, height),
  }).finally(() => page.cleanup());

  const resized = await resizeImage(png, PNG_MIME, resizeOptions);
  if (!resized)
    return { ok: false, reason: "the rendered page doesn't fit the model's image limits" };
  return { ok: true, image: { type: 'image', data: resized.data, mimeType: resized.mimeType } };
}
