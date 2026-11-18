import { open, readFile, stat } from 'node:fs/promises';
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/** What a page paints besides text: filled or stroked paths, and raster images. */
export interface PageGraphics {
  vectorShapes: number;
  images: PaintedImage[];
}

export interface PaintedImage {
  pixels: number;
  /** Share of the page area the image is drawn over, 0 to 1. */
  pageCoverage: number;
}

type PdfJsOps = Awaited<ReturnType<typeof getResolvedPDFJS>>['OPS'];
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;
type OperatorList = Awaited<ReturnType<PdfPage['getOperatorList']>>;

const PDF_SIGNATURE = Buffer.from('%PDF-');
const PDF_EXTENSION = '.pdf';
// Readers tolerate junk before the header within the first KB, but only trust
// that for files named .pdf: text that merely mentions "%PDF-" must stay text.
const SIGNATURE_SEARCH_BYTES = 1024;
const MAX_PDF_BYTES = 200 * 1024 * 1024;
const WHITESPACE = /\s/g;

export async function isPdfFile(absolutePath: string): Promise<boolean> {
  // Checked before opening: opening a FIFO for reading blocks until a writer appears.
  if (!(await stat(absolutePath)).isFile()) return false;
  const handle = await open(absolutePath, 'r');
  try {
    const head = Buffer.alloc(SIGNATURE_SEARCH_BYTES);
    const { bytesRead } = await handle.read(head, 0, SIGNATURE_SEARCH_BYTES, 0);
    const signatureAt = head.subarray(0, bytesRead).indexOf(PDF_SIGNATURE);
    return (
      signatureAt === 0 || (signatureAt > 0 && absolutePath.toLowerCase().endsWith(PDF_EXTENSION))
    );
  } finally {
    await handle.close();
  }
}

export async function openPdf(absolutePath: string): Promise<PdfDocument> {
  const { size } = await stat(absolutePath);
  if (size > MAX_PDF_BYTES) {
    throw new Error(
      `PDF is ${Math.round(size / (1024 * 1024))}MB, over the ${MAX_PDF_BYTES / (1024 * 1024)}MB read limit.`,
    );
  }
  const bytes = new Uint8Array(await readFile(absolutePath));
  try {
    return await getDocumentProxy(bytes);
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error('PDF is password-protected and cannot be read without its password.');
    }
    throw error;
  }
}

export async function extractPageText(pdf: PdfDocument, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  try {
    const { items } = await page.getTextContent();
    const raw = items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
      .join('');
    return normalizeWhitespace(raw);
  } finally {
    page.cleanup();
  }
}

export async function inspectPageGraphics(
  pdf: PdfDocument,
  pageNumber: number,
): Promise<PageGraphics> {
  const { OPS } = await getResolvedPDFJS();
  const page = await pdf.getPage(pageNumber);
  try {
    const operators = await page.getOperatorList();
    const [x0, y0, x1, y1] = page.view;
    return collectGraphics(operators, OPS, Math.abs((x1 - x0) * (y1 - y0)));
  } finally {
    page.cleanup();
  }
}

// An image fills the unit square under the current transform, so its drawn area
// is that transform's determinant; tracking the determinant through save/restore,
// cm and form XObjects is enough.
function collectGraphics(
  { fnArray, argsArray }: OperatorList,
  OPS: PdfJsOps,
  pageArea: number,
): PageGraphics {
  const graphics: PageGraphics = { vectorShapes: 0, images: [] };
  const savedScales: number[] = [];
  let areaScale = 1;
  const paint = (width: number, height: number) =>
    graphics.images.push({ pixels: width * height, pageCoverage: Math.abs(areaScale) / pageArea });

  fnArray.forEach((fn, index) => {
    const args = argsArray[index];
    switch (fn) {
      case OPS.constructPath:
        graphics.vectorShapes++;
        break;
      case OPS.save:
        savedScales.push(areaScale);
        break;
      case OPS.paintFormXObjectBegin:
        savedScales.push(areaScale);
        if (args[0]) areaScale *= determinant(args[0]);
        break;
      case OPS.restore:
      case OPS.paintFormXObjectEnd:
        areaScale = savedScales.pop() ?? 1;
        break;
      case OPS.transform:
        areaScale *= determinant(args);
        break;
      case OPS.paintImageXObject:
        paint(args[1], args[2]);
        break;
      case OPS.paintInlineImageXObject:
        paint(args[0].width, args[0].height);
        break;
    }
  });
  return graphics;
}

function determinant([a, b, c, d]: number[]): number {
  return a * d - b * c;
}

export function countVisibleCharacters(text: string): number {
  return text.replace(WHITESPACE, '').length;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
