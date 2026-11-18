import { open, readFile, stat } from 'node:fs/promises';
import { getDocumentProxy } from 'unpdf';

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

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
