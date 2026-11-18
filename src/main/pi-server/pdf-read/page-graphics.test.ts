import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TextContent } from '@earendil-works/pi-ai';
import { buildPdf } from '../__fixtures__/build-pdf';
import * as pdfDocument from './pdf-document';
import { createReadToolWithPdf } from './read-tool';

vi.mock('./pdf-document', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdf-document')>()),
  inspectPageGraphics: vi.fn(),
}));

type ToolContext = Parameters<ReturnType<typeof createReadToolWithPdf>['execute']>[4];

const VISION_CONTEXT = { model: { input: ['text', 'image'] } };
// Above half the 1s check budget, so the third page is past it.
const SLOW_CHECK_MS = 600;
const PAGES = 3;
const SCAN_PIXELS = 2480 * 3508;

let dir: string;
let pdfPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'page-graphics-'));
  pdfPath = join(dir, 'doc.pdf');
  const page = (n: number) => ({
    lines: [
      `Page ${n} has enough body text to count as a text page.`,
      'A second line of body text.',
    ],
  });
  await writeFile(pdfPath, buildPdf(Array.from({ length: PAGES }, (_, i) => page(i + 1))));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.mocked(pdfDocument.inspectPageGraphics).mockReset();
});

async function readText(): Promise<string> {
  const tool = createReadToolWithPdf(dir);
  const ctx = { cwd: dir, ...VISION_CONTEXT } as unknown as ToolContext;
  const result = await tool.execute('call', { path: 'doc.pdf' }, undefined, undefined, ctx);
  return result.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

describe('drawing check', () => {
  it('still returns the text when the check fails', async () => {
    vi.mocked(pdfDocument.inspectPageGraphics).mockRejectedValue(new Error('bad image resource'));
    const text = await readText();
    expect(text).toContain('--- Page 1 ---\nPage 1 has enough body text');
    expect(text).not.toContain('has drawings or figures');
  });

  it('stops checking once its time budget is spent and says which pages it skipped', async () => {
    vi.mocked(pdfDocument.inspectPageGraphics).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_CHECK_MS));
      return { vectorShapes: 0, images: [] };
    });
    const text = await readText();
    expect(pdfDocument.inspectPageGraphics).toHaveBeenCalledTimes(2);
    expect(text).toContain("[Page 3 wasn't checked for drawings or figures (time limit).]");
  });

  it('stops checking quietly after two scan-backed pages in a row', async () => {
    vi.mocked(pdfDocument.inspectPageGraphics).mockResolvedValue({
      vectorShapes: 0,
      images: [{ pixels: SCAN_PIXELS, pageCoverage: 1 }],
    });
    const text = await readText();
    expect(pdfDocument.inspectPageGraphics).toHaveBeenCalledTimes(2);
    expect(text).not.toContain('checked for drawings or figures');
    expect(text).not.toContain('has drawings or figures');
  });

  it('keeps checking after a single full-page cover image', async () => {
    vi.mocked(pdfDocument.inspectPageGraphics)
      .mockResolvedValueOnce({
        vectorShapes: 0,
        images: [{ pixels: SCAN_PIXELS, pageCoverage: 1 }],
      })
      .mockResolvedValue({ vectorShapes: 0, images: [] });
    await readText();
    expect(pdfDocument.inspectPageGraphics).toHaveBeenCalledTimes(PAGES);
  });
});
