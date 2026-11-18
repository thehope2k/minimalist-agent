import type { Api, ImageContent, Model, TextContent } from '@earendil-works/pi-ai';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from '@earendil-works/pi-coding-agent';
import { createLogger } from '../../../shared/sub-logger';
import { formatPdfRead, type ReadPdfPage } from './format-pdf-read';
import { probePageRendering, renderPageImage, type PageImageResult } from './page-image';
import { resolvePageRange, type PageRange } from './page-range';
import { countVisibleCharacters, extractPageText, openPdf, type PdfDocument } from './pdf-document';

const log = createLogger('pdf-read');

export const MAX_PDF_PAGES_PER_READ = 20;
// A page image costs far more context than a page of text, so a read stops at
// the page boundary once this many are attached, like the text byte budget.
export const MAX_PDF_PAGE_IMAGES_PER_READ = 10;
// Below this many non-whitespace characters a page is treated as scanned or
// image-only, so its image is attached even when page images weren't asked for.
const MIN_TEXT_CHARS_FOR_TEXT_ONLY = 50;

export interface PdfReadRequest {
  absolutePath: string;
  pages?: string;
  pageImages: boolean;
}

export interface PdfReadResult {
  content: (TextContent | ImageContent)[];
  text: string;
}

type PageImagePlan = { render: true } | { render: false; reason: string };
type ExtractedPage = ReadPdfPage & { wantsImage: boolean };

export async function readPdf(
  request: PdfReadRequest,
  model: Model<Api> | undefined,
  signal: AbortSignal | undefined,
): Promise<PdfReadResult> {
  const pdf = await openPdf(request.absolutePath);
  try {
    signal?.throwIfAborted();
    const resolved = resolvePageRange(request.pages, pdf.numPages, MAX_PDF_PAGES_PER_READ);
    if (!resolved.ok) throw new Error(resolved.message);

    const imagePlan = await planPageImages(model);
    const extracted = await extractPagesWithinBudget(pdf, resolved.range, {
      pageImages: request.pageImages,
      imagesRender: imagePlan.render,
      signal,
    });
    const pages: ReadPdfPage[] = [];
    for (const { wantsImage, ...page } of extracted) {
      signal?.throwIfAborted();
      const image = wantsImage ? await pageImage(pdf, page.number, imagePlan, model) : undefined;
      pages.push({ ...page, image });
    }

    const content = formatPdfRead({
      totalPages: pdf.numPages,
      pages,
      requestedLast: resolved.requestedLast,
      maxPagesPerRead: MAX_PDF_PAGES_PER_READ,
    });
    return { content, text: joinText(content) };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

interface ExtractionOptions {
  pageImages: boolean;
  imagesRender: boolean;
  signal: AbortSignal | undefined;
}

async function extractPagesWithinBudget(
  pdf: PdfDocument,
  range: PageRange,
  { pageImages, imagesRender, signal }: ExtractionOptions,
): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = [];
  let usedBytes = 0;
  let usedImages = 0;
  for (let number = range.first; number <= range.last; number++) {
    signal?.throwIfAborted();
    const text = await extractPageText(pdf, number);
    const bytes = Buffer.byteLength(text, 'utf-8');
    const wantsImage = pageImages || isImageOnlyPage(text);
    const images = wantsImage && imagesRender ? 1 : 0;
    const overBudget =
      usedBytes + bytes > DEFAULT_MAX_BYTES || usedImages + images > MAX_PDF_PAGE_IMAGES_PER_READ;
    if (pages.length > 0 && overBudget) break;

    const truncation = truncateHead(text);
    pages.push({
      number,
      text: truncation.content,
      textTruncatedAt: truncation.truncated ? formatSize(truncation.outputBytes) : undefined,
      wantsImage,
    });
    usedBytes += bytes;
    usedImages += images;
  }
  return pages;
}

function isImageOnlyPage(text: string): boolean {
  return countVisibleCharacters(text) < MIN_TEXT_CHARS_FOR_TEXT_ONLY;
}

async function planPageImages(model: Model<Api> | undefined): Promise<PageImagePlan> {
  if (model && !model.input.includes('image')) {
    return { render: false, reason: "the current model doesn't accept images" };
  }
  const support = await probePageRendering();
  return support.ok ? { render: true } : { render: false, reason: support.reason };
}

async function pageImage(
  pdf: PdfDocument,
  pageNumber: number,
  plan: PageImagePlan,
  model: Model<Api> | undefined,
): Promise<PageImageResult> {
  if (!plan.render) return { ok: false, reason: plan.reason };
  try {
    return await renderPageImage(pdf, pageNumber, model?.inputLimits?.images?.resize);
  } catch (error) {
    log.warn(`Failed to render PDF page ${pageNumber}`, error);
    return {
      ok: false,
      reason: `rendering failed (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

function joinText(content: (TextContent | ImageContent)[]): string {
  return content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}
