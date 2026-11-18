import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import { DEFAULT_MAX_BYTES } from '@earendil-works/pi-coding-agent';
import { buildPdf, type FixturePage } from '../__fixtures__/build-pdf';
import { createReadToolWithPdf } from './read-tool';

type ReadParams = Parameters<ReturnType<typeof createReadToolWithPdf>['execute']>[1];
type ToolContext = Parameters<ReturnType<typeof createReadToolWithPdf>['execute']>[4];

const VISION_MODEL = { input: ['text', 'image'] };
const TEXT_ONLY_MODEL = { input: ['text'] };
const LONG_PDF_PAGES = 25;
const IMAGE_CAP_PDF_PAGES = 12;
const DRAWING_SHAPES = 600;
const RULING_SHAPES = 20;
// Fits inside the page width at a 1pt font, so pdf.js keeps every character.
const HEAVY_PAGE_CHARS_PER_LINE = 500;

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pdf-read-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writePdf(name: string, pages: FixturePage[]): Promise<string> {
  await writeFile(join(dir, name), buildPdf(pages));
  return name;
}

function textPage(number: number): FixturePage {
  return {
    lines: [
      `Page ${number} heading`,
      `This is the body text of page number ${number} in the fixture.`,
    ],
  };
}

async function read(params: ReadParams, model: object = VISION_MODEL) {
  const tool = createReadToolWithPdf(dir);
  const ctx = { cwd: dir, model } as unknown as ToolContext;
  const result = await tool.execute('call', params, undefined, undefined, ctx);
  const text = result.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  const images = result.content.filter((block): block is ImageContent => block.type === 'image');
  return { text, images, result };
}

describe('Read tool on PDFs', () => {
  it('returns text with page markers and no images for text pages', async () => {
    const path = await writePdf('text.pdf', [textPage(1), textPage(2)]);
    const { text, images, result } = await read({ path });

    expect(text).toContain('[PDF, 2 pages total. Showing pages 1-2.]');
    expect(text).toContain('--- Page 1 ---\nPage 1 heading');
    expect(text).toContain('--- Page 2 ---\nPage 2 heading');
    expect(images).toHaveLength(0);
    expect(result.structuredContent).toBe(text);
  });

  it('attaches an image for a page without a text layer', async () => {
    const path = await writePdf('scan.pdf', [textPage(1), {}]);
    const { text, images, result } = await read({ path });

    expect(text).toContain('--- Page 2 ---\n[No text layer: likely a scanned or image-only page.]');
    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toMatch(/^image\//);
    expect(result.content.at(-1)).toEqual(images[0]);
  });

  it('explains a missing page image when the model has no vision', async () => {
    const path = await writePdf('scan-text-model.pdf', [{}]);
    const { text, images } = await read({ path }, TEXT_ONLY_MODEL);

    expect(images).toHaveLength(0);
    expect(text).toContain("[Page image unavailable: the current model doesn't accept images.]");
  });

  it('flags a drawing whose shapes the text misses', async () => {
    const path = await writePdf('drawing.pdf', [
      { ...textPage(1), vectorShapes: DRAWING_SHAPES },
      textPage(2),
    ]);
    const { text, images } = await read({ path });

    expect(images).toHaveLength(0);
    expect(text).toContain(
      `[Page 1 has drawings or figures the text doesn't capture (${DRAWING_SHAPES} vector shapes). ` +
        'Re-read with pages="1" and page_images: true to see it.]',
    );
    expect(text.match(/has drawings or figures/g)).toHaveLength(1);
  });

  it('flags a figure image but not a small logo', async () => {
    const path = await writePdf('figures-and-logos.pdf', [
      { ...textPage(1), image: { width: 400, height: 300 } },
      { ...textPage(2), image: { width: 40, height: 40 } },
    ]);
    const { text } = await read({ path });

    expect(text).toContain("[Page 1 has drawings or figures the text doesn't capture (1 image).");
    expect(text).not.toContain('Page 2 has drawings');
  });

  it('judges images by the area they cover, not their pixel count', async () => {
    const path = await writePdf('branding.pdf', [
      { ...textPage(1), image: { width: 600, height: 600, drawnWidth: 72, drawnHeight: 72 } },
      { ...textPage(2), image: { width: 800, height: 1000, drawnWidth: 612, drawnHeight: 792 } },
    ]);
    const { text } = await read({ path });
    expect(text).not.toContain('has drawings or figures');
  });

  it('leaves a few ruling lines unflagged', async () => {
    const path = await writePdf('ruled.pdf', [{ ...textPage(1), vectorShapes: RULING_SHAPES }]);
    const { text } = await read({ path });
    expect(text).not.toContain('has drawings or figures');
  });

  it('skips the drawing hint when the model cannot view images', async () => {
    const path = await writePdf('drawing-text-model.pdf', [
      { ...textPage(1), vectorShapes: DRAWING_SHAPES },
    ]);
    const { text } = await read({ path }, TEXT_ONLY_MODEL);
    expect(text).not.toContain('has drawings or figures');
  });

  it('attaches every page image when page_images is set', async () => {
    const path = await writePdf('figures.pdf', [textPage(1), textPage(2)]);
    const { images } = await read({ path, page_images: true });

    expect(images).toHaveLength(2);
  });

  it('stops at the page-image cap and offers the next range', async () => {
    const path = await writePdf(
      'many-figures.pdf',
      Array.from({ length: IMAGE_CAP_PDF_PAGES }, (_, i) => textPage(i + 1)),
    );
    const { text, images } = await read({ path, page_images: true });

    expect(images).toHaveLength(10);
    expect(text).toContain('[Pages 11-12 not shown. Use pages="11-12" to continue.]');
  });

  it('caps a read at 20 pages and offers the next range', async () => {
    const path = await writePdf(
      'long.pdf',
      Array.from({ length: LONG_PDF_PAGES }, (_, i) => textPage(i + 1)),
    );
    const first = await read({ path });
    expect(first.text).toContain('Showing pages 1-20.');
    expect(first.text).toContain('[Pages 21-25 not shown. Use pages="21-25" to continue.]');

    const rest = await read({ path, pages: '21-25' });
    expect(rest.text).toContain('Showing pages 21-25.');
    expect(rest.text).toContain('--- Page 25 ---');
    expect(rest.text).not.toContain('not shown');
  });

  it('stops at a page boundary when the text budget runs out', async () => {
    const line = 'x'.repeat(HEAVY_PAGE_CHARS_PER_LINE);
    const linesPerPage = Math.ceil((DEFAULT_MAX_BYTES * 0.6) / line.length);
    const heavyPage = { fontSize: 1, lines: Array.from({ length: linesPerPage }, () => line) };
    const path = await writePdf('heavy.pdf', [heavyPage, heavyPage, heavyPage]);

    const { text } = await read({ path });
    expect(text).toContain('Showing page 1.');
    expect(text).toContain('[Pages 2-3 not shown. Use pages="2-3" to continue.]');
  });

  it('rejects an invalid page spec', async () => {
    const path = await writePdf('spec.pdf', [textPage(1)]);
    await expect(read({ path, pages: '4' })).rejects.toThrow('beyond the end of the PDF');
    await expect(read({ path, pages: 'first' })).rejects.toThrow('Invalid pages "first"');
  });

  it('rejects line offsets on a PDF', async () => {
    const path = await writePdf('offset.pdf', [textPage(1)]);
    await expect(read({ path, offset: 2 })).rejects.toThrow('Use pages to read part of a PDF.');
  });

  it('decodes text in non-embedded CJK fonts', async () => {
    const path = await writePdf('japanese.pdf', [{ japanese: '日本語のテキスト' }]);
    const { text } = await read({ path });
    expect(text).toContain('日本語のテキスト');
  });

  it('settles as soon as the read is aborted', async () => {
    const path = await writePdf('abort.pdf', [textPage(1)]);
    const tool = createReadToolWithPdf(dir);
    const controller = new AbortController();
    const ctx = { cwd: dir, model: VISION_MODEL } as unknown as ToolContext;
    const pending = tool.execute('call', { path }, controller.signal, undefined, ctx);
    controller.abort();
    await expect(pending).rejects.toThrow('Operation aborted');
  });

  it('detects a .pdf with bytes before its header', async () => {
    await writeFile(
      join(dir, 'prefixed.pdf'),
      Buffer.concat([Buffer.from('junk\n'), buildPdf([textPage(1)])]),
    );
    const { text } = await read({ path: 'prefixed.pdf' });
    expect(text).toContain('--- Page 1 ---');
  });

  it('finds a PDF whose name uses a curly apostrophe when asked with a straight one', async () => {
    await writeFile(join(dir, 'John\u2019s report.pdf'), buildPdf([textPage(1)]));
    const { text } = await read({ path: "John's report.pdf" });
    expect(text).toContain('--- Page 1 ---');
  });

  it('detects a PDF by its content, not its extension', async () => {
    await writeFile(join(dir, 'report.bin'), buildPdf([textPage(1)]));
    const { text } = await read({ path: 'report.bin' });
    expect(text).toContain('--- Page 1 ---');
  });
});

describe('Read tool on other files', () => {
  it('still reads text files', async () => {
    await writeFile(join(dir, 'notes.txt'), 'first\nsecond\nthird');
    const { text } = await read({ path: 'notes.txt', offset: 2, limit: 1 });
    expect(text).toContain('second');
    expect(text).not.toContain('first');
  });

  it('reads a text file that mentions the PDF header as text', async () => {
    await writeFile(join(dir, 'pdf-notes.ts'), "const PDF_SIGNATURE = '%PDF-';\nexport {};");
    const { text, images } = await read({ path: 'pdf-notes.ts', offset: 1, limit: 1 });
    expect(text).toContain("const PDF_SIGNATURE = '%PDF-';");
    expect(images).toHaveLength(0);
  });

  it('accepts page_images: false on a text file', async () => {
    await writeFile(join(dir, 'defaults.txt'), 'hello');
    const { text } = await read({ path: 'defaults.txt', page_images: false });
    expect(text).toContain('hello');
  });

  it('rejects PDF-only parameters', async () => {
    await writeFile(join(dir, 'plain.txt'), 'hello');
    await expect(read({ path: 'plain.txt', pages: '1' })).rejects.toThrow(
      'pages and page_images apply only to PDF files.',
    );
  });

  it('leaves missing files to the base read', async () => {
    await expect(read({ path: 'missing.pdf' })).rejects.toThrow(/ENOENT/);
  });

  it('reports a missing PDF as missing even with pages', async () => {
    await expect(read({ path: 'missing.pdf', pages: '2' })).rejects.toThrow(/ENOENT/);
  });
});
