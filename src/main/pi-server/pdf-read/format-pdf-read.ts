import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import { formatPageRange, type PageRange } from './page-range';
import type { PageImageResult } from './page-image';

export interface ReadPdfPage {
  number: number;
  text: string;
  textTruncatedAt?: string;
  image?: PageImageResult;
  unseenGraphics?: UnseenGraphics;
  /** The drawing check ran out of time before reaching this page. */
  graphicsUnchecked?: boolean;
}

export interface UnseenGraphics {
  vectorShapes: number;
  figureImages: number;
}

export interface PdfReadView {
  totalPages: number;
  pages: ReadPdfPage[];
  /** Last page the caller asked for; anything after the last shown page is offered as a continuation. */
  requestedLast: number;
  maxPagesPerRead: number;
}

export function formatPdfRead(view: PdfReadView): (TextContent | ImageContent)[] {
  const blocks: (TextContent | ImageContent)[] = [];
  let pendingText = formatHeader(view);

  for (const page of view.pages) {
    pendingText += `\n\n${formatPageText(page)}`;
    if (page.image?.ok) {
      blocks.push(textBlock(pendingText), page.image.image);
      pendingText = '';
    }
  }

  const unchecked = formatUncheckedGraphics(view.pages);
  if (unchecked) pendingText += `\n\n${unchecked}`;
  const continuation = formatContinuation(view);
  if (continuation) pendingText += `\n\n${continuation}`;
  if (pendingText) blocks.push(textBlock(pendingText));
  return blocks;
}

function textBlock(text: string): TextContent {
  return { type: 'text', text: text.trimStart() };
}

function formatHeader({ totalPages, pages }: PdfReadView): string {
  const shown = shownRange(pages);
  return `[PDF, ${totalPages} pages total. Showing page${shown.first === shown.last ? '' : 's'} ${formatPageRange(shown)}.]`;
}

function formatPageText(page: ReadPdfPage): string {
  const lines = [`--- Page ${page.number} ---`];
  lines.push(page.text || '[No text layer: likely a scanned or image-only page.]');
  if (page.textTruncatedAt) lines.push(`[Page text truncated at ${page.textTruncatedAt}.]`);
  if (page.image && !page.image.ok) lines.push(`[Page image unavailable: ${page.image.reason}.]`);
  if (page.unseenGraphics) lines.push(formatUnseenGraphics(page.number, page.unseenGraphics));
  return lines.join('\n');
}

function formatUnseenGraphics(
  pageNumber: number,
  { vectorShapes, figureImages }: UnseenGraphics,
): string {
  const parts = [
    vectorShapes > 0 ? plural(vectorShapes, 'vector shape') : undefined,
    figureImages > 0 ? plural(figureImages, 'image') : undefined,
  ].filter(Boolean);
  return (
    `[Page ${pageNumber} has drawings or figures the text doesn't capture (${parts.join(', ')}). ` +
    `Re-read with pages="${pageNumber}" and page_images: true to see it.]`
  );
}

function formatUncheckedGraphics(pages: ReadPdfPage[]): string | undefined {
  const unchecked = pages.filter((page) => page.graphicsUnchecked).map((page) => page.number);
  if (unchecked.length === 0) return undefined;
  const subject = unchecked.length === 1 ? "Page {list} wasn't" : "Pages {list} weren't";
  return `[${subject.replace('{list}', formatPageList(unchecked))} checked for drawings or figures (time limit).]`;
}

function formatPageList(numbers: number[]): string {
  const runs: PageRange[] = [];
  for (const number of numbers) {
    const last = runs.at(-1);
    if (last && number === last.last + 1) last.last = number;
    else runs.push({ first: number, last: number });
  }
  return runs.map(formatPageRange).join(', ');
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

function formatContinuation({
  pages,
  requestedLast,
  maxPagesPerRead,
}: PdfReadView): string | undefined {
  const next = shownRange(pages).last + 1;
  if (next > requestedLast) return undefined;
  const suggested = formatPageRange({
    first: next,
    last: Math.min(requestedLast, next + maxPagesPerRead - 1),
  });
  return `[Pages ${formatPageRange({ first: next, last: requestedLast })} not shown. Use pages="${suggested}" to continue.]`;
}

function shownRange(pages: ReadPdfPage[]): PageRange {
  return { first: pages[0].number, last: pages[pages.length - 1].number };
}
