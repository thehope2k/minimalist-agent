import { createLogger } from '../../../shared/sub-logger';
import type { UnseenGraphics } from './format-pdf-read';
import { inspectPageGraphics, type PageGraphics, type PdfDocument } from './pdf-document';

const log = createLogger('pdf-read');

// Tuned on real files: text pages and invoices draw under ~100 paths, ruled
// tables and drawings hundreds or more.
const MIN_VECTOR_SHAPES_FOR_DRAWING = 200;
// A figure is a real raster image drawn over a meaningful part of the page.
// Logos and icons fall under the coverage floor however many pixels they hold;
// page-sized backgrounds, watermarks and the scan behind an OCR text layer sit
// above the ceiling.
const MIN_FIGURE_IMAGE_PIXELS = 200 * 200;
const MIN_FIGURE_PAGE_COVERAGE = 0.03;
const MAX_FIGURE_PAGE_COVERAGE = 0.9;
// pdf.js decodes every embedded image while listing a page's operations
// (~250 ms for a 6-megapixel photo), so checking stops once this is spent.
const MAX_CHECK_MS_PER_READ = 1000;
// Scans with an OCR text layer pay that decode on every page and never earn a
// hint, so after this many in a row the rest of the read is assumed to be scan
// too. Two, not one, so a full-bleed cover photo doesn't switch the check off.
const SCAN_PAGES_IN_A_ROW_TO_STOP = 2;

export type GraphicsCheckResult =
  { kind: 'hint'; unseen: UnseenGraphics } | { kind: 'none' } | { kind: 'out-of-time' };

export class GraphicsCheck {
  private spentMs = 0;
  private scanPagesInARow = 0;

  async check(pdf: PdfDocument, pageNumber: number): Promise<GraphicsCheckResult> {
    if (this.scanPagesInARow >= SCAN_PAGES_IN_A_ROW_TO_STOP) return { kind: 'none' };
    if (this.spentMs >= MAX_CHECK_MS_PER_READ) return { kind: 'out-of-time' };
    const started = performance.now();
    try {
      const graphics = await inspectPageGraphics(pdf, pageNumber);
      this.scanPagesInARow = isScanBacked(graphics) ? this.scanPagesInARow + 1 : 0;
      const unseen = unseenGraphics(graphics);
      return unseen ? { kind: 'hint', unseen } : { kind: 'none' };
    } catch (error) {
      // The hint is optional; a page pdf.js can't list operations for still reads as text.
      log.warn(`Drawing check failed on PDF page ${pageNumber}`, error);
      return { kind: 'none' };
    } finally {
      this.spentMs += performance.now() - started;
    }
  }
}

function isScanBacked({ images }: PageGraphics): boolean {
  return images.some(({ pageCoverage }) => pageCoverage > MAX_FIGURE_PAGE_COVERAGE);
}

function unseenGraphics({ vectorShapes, images }: PageGraphics): UnseenGraphics | undefined {
  const figureImages = images.filter(
    ({ pixels, pageCoverage }) =>
      pixels >= MIN_FIGURE_IMAGE_PIXELS &&
      pageCoverage >= MIN_FIGURE_PAGE_COVERAGE &&
      pageCoverage <= MAX_FIGURE_PAGE_COVERAGE,
  ).length;
  const isDrawing = vectorShapes >= MIN_VECTOR_SHAPES_FOR_DRAWING;
  if (!isDrawing && figureImages === 0) return undefined;
  return { vectorShapes: isDrawing ? vectorShapes : 0, figureImages };
}
