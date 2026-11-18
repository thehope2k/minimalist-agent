// Builds small, valid PDFs for tests so no binary fixtures live in the repo.
// A page with `lines` gets a Helvetica text layer; one without is a filled
// rectangle only, which reads like a scanned page (no text layer). Text past
// the page edge is clipped by pdf.js, so large pages need a small font size.
// `japanese` text uses a non-embedded CID font with the predefined UniJIS-UCS2-H
// CMap, which pdf.js can only decode with its CMap files. `vectorShapes` strokes
// that many separate small rectangles (a drawing), and `image` paints a gray
// raster image of the given pixel size; both combine with text.

export interface FixturePage {
  lines?: string[];
  fontSize?: number;
  japanese?: string;
  vectorShapes?: number;
  image?: FixtureImage;
}

/** Pixel size of the image; drawn at that many points unless a drawn size is given. */
export interface FixtureImage {
  width: number;
  height: number;
  drawnWidth?: number;
  drawnHeight?: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const DEFAULT_FONT_SIZE = 12;
const LINE_SPACING = 1.2;
const GRID_COLUMNS = 40;
const GRID_CELL = 10;
const GRAY = 0x80;

export function buildPdf(pages: FixturePage[]): Buffer {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);

  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const cjkFontId = add(CJK_FONT);

  const pageIds = pages.map((page) => {
    const stream = pageStream(page);
    const contentId = add(streamObject('', stream));
    const xObjects = page.image ? `/XObject << /Im1 ${add(imageObject(page.image))} 0 R >>` : '';
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${cjkFontId} 0 R >> ${xObjects} >> /Contents ${contentId} 0 R >>`,
    );
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  return serialize(objects, catalogId);
}

const CJK_FONT =
  '<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular /Encoding /UniJIS-UCS2-H ' +
  '/DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular ' +
  '/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> ' +
  '/FontDescriptor << /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 4 ' +
  '/FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >> >>] >>';

function pageStream(page: FixturePage): string {
  const parts = [
    page.japanese ? japaneseStream(page.japanese) : undefined,
    page.lines ? textStream(page.lines, page.fontSize ?? DEFAULT_FONT_SIZE) : undefined,
    page.vectorShapes ? gridStream(page.vectorShapes) : undefined,
    page.image ? imagePaint(page.image) : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : shapeStream();
}

function gridStream(count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const x = MARGIN + (i % GRID_COLUMNS) * GRID_CELL;
    const y = MARGIN + Math.floor(i / GRID_COLUMNS) * GRID_CELL;
    return `${x} ${y} ${GRID_CELL / 2} ${GRID_CELL / 2} re S`;
  }).join('\n');
}

function imagePaint({
  width,
  height,
  drawnWidth = width,
  drawnHeight = height,
}: FixtureImage): string {
  const x = drawnWidth >= PAGE_WIDTH ? 0 : MARGIN;
  const y = drawnHeight >= PAGE_HEIGHT ? 0 : MARGIN;
  return `q ${drawnWidth} 0 0 ${drawnHeight} ${x} ${y} cm /Im1 Do Q`;
}

function imageObject({ width, height }: FixtureImage): string {
  const pixels = String.fromCharCode(GRAY).repeat(width * height);
  return streamObject(
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 `,
    pixels,
  );
}

function streamObject(dictionaryEntries: string, data: string): string {
  return `<< ${dictionaryEntries}/Length ${Buffer.byteLength(data, 'latin1')} >>\nstream\n${data}\nendstream`;
}

function japaneseStream(text: string): string {
  const utf16be = Buffer.from(text, 'utf16le').swap16().toString('hex').toUpperCase();
  return `BT /F2 ${DEFAULT_FONT_SIZE} Tf ${MARGIN} ${PAGE_HEIGHT - MARGIN} Td <${utf16be}> Tj ET`;
}

function textStream(lines: string[], fontSize: number): string {
  const shown = lines.map((line) => `(${escapePdfString(line)}) Tj T*`).join('\n');
  return `BT /F1 ${fontSize} Tf ${fontSize * LINE_SPACING} TL ${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n${shown}\nET`;
}

function shapeStream(): string {
  return `0.2 0.4 0.8 rg ${MARGIN} ${MARGIN} ${PAGE_WIDTH - 2 * MARGIN} ${PAGE_HEIGHT - 2 * MARGIN} re f`;
}

function escapePdfString(text: string): string {
  return text.replace(/[\\()]/g, (char) => `\\${char}`);
}

function serialize(objects: string[], rootId: number): Buffer {
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body, 'latin1');
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  const entries = offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}` +
    `trailer\n<< /Size ${objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
