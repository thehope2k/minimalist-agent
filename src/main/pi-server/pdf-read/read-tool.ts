import { Type } from 'typebox';
import {
  createReadToolDefinition,
  type ReadToolDetails,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { isPdfFile } from './pdf-document';
import { resolveExistingPath } from './read-path';
import { MAX_PDF_PAGE_IMAGES_PER_READ, MAX_PDF_PAGES_PER_READ, readPdf } from './read-pdf';

const readWithPdfSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to read (relative or absolute)' }),
  offset: Type.Optional(
    Type.Number({ description: 'Line number to start reading from (1-indexed). Text files only.' }),
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Maximum number of lines to read. Text files only.' }),
  ),
  pages: Type.Optional(
    Type.String({
      description: `PDF only: a page ("7") or inclusive range ("3-12"), at most ${MAX_PDF_PAGES_PER_READ} pages per call. Defaults to the first ${MAX_PDF_PAGES_PER_READ}.`,
    }),
  ),
  page_images: Type.Optional(
    Type.Boolean({
      description:
        'PDF only: also attach an image of each page read. Set it when the answer depends on how the page looks, ' +
        'not just its words: drawings, diagrams, charts, maps, forms, slides, or tables whose layout matters; ' +
        'when the text comes out as scattered labels and numbers; or when the page mentions a figure you need. ' +
        'Leave it off for prose. Images cost far more context than text, so re-read only the pages that need ' +
        `them (pages="4"). At most ${MAX_PDF_PAGE_IMAGES_PER_READ} page images per call.`,
    }),
  ),
});

// Same message as the base read, so an aborted Read looks the same either way.
const ABORTED_MESSAGE = 'Operation aborted';

const PDF_DESCRIPTION =
  `PDFs are read page by page: text with page markers, up to ${MAX_PDF_PAGES_PER_READ} pages per call (use pages to pick them). ` +
  'Pages without a text layer (scans) are attached as page images automatically; pages whose drawings or figures ' +
  'the text misses are flagged so you can re-read them with page_images.';

// The base read's TUI renderers are left out: they're typed to its narrower
// arguments, and this app renders tool calls in its own UI.
export function createReadToolWithPdf(
  cwd: string,
): ToolDefinition<typeof readWithPdfSchema, ReadToolDetails | undefined> {
  const base = createReadToolDefinition(cwd);
  return {
    name: base.name,
    label: base.label,
    description: `${base.description} ${PDF_DESCRIPTION}`,
    promptSnippet: base.promptSnippet,
    promptGuidelines: base.promptGuidelines,
    outputSchema: base.outputSchema,
    constrainedSampling: base.constrainedSampling,
    parameters: readWithPdfSchema,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { path, offset, limit, pages, page_images: pageImages } = params;
      const target = await classifyReadTarget(path, ctx?.cwd || cwd);
      if (target.kind === 'unopenable') {
        return base.execute(toolCallId, { path, offset, limit }, signal, onUpdate, ctx);
      }
      if (target.kind === 'other') {
        // page_images: false asks for nothing; some models fill optional parameters with defaults.
        if (pages !== undefined || pageImages === true) {
          throw new Error('pages and page_images apply only to PDF files.');
        }
        return base.execute(toolCallId, { path, offset, limit }, signal, onUpdate, ctx);
      }

      if (offset !== undefined || limit !== undefined) {
        throw new Error('offset and limit apply to text files. Use pages to read part of a PDF.');
      }
      const result = await rejectOnAbort(
        () =>
          readPdf(
            { absolutePath: target.absolutePath, pages, pageImages: pageImages ?? false },
            ctx?.model,
            signal,
          ),
        signal,
      );
      // The base output schema holds text or a single image, so programmatic
      // callers get the text; page images reach the model through `content`.
      return { content: result.content, details: undefined, structuredContent: result.text };
    },
  };
}

// pdf.js parses and renders on this thread and readPdf only checks the signal
// between steps, so settle the tool call as soon as the user aborts; the
// remaining work stops at its next check.
function rejectOnAbort<T>(start: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return start();
  if (signal.aborted) return Promise.reject(new Error(ABORTED_MESSAGE));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error(ABORTED_MESSAGE));
    signal.addEventListener('abort', onAbort, { once: true });
    start()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

type ReadTarget =
  { kind: 'pdf'; absolutePath: string } | { kind: 'other' } | { kind: 'unopenable' };

// Missing or unreadable paths go to the base read, which reports them in its own words.
async function classifyReadTarget(requested: string, cwd: string): Promise<ReadTarget> {
  const absolutePath = await resolveExistingPath(requested, cwd);
  if (absolutePath === undefined) return { kind: 'unopenable' };
  try {
    return (await isPdfFile(absolutePath)) ? { kind: 'pdf', absolutePath } : { kind: 'other' };
  } catch (error) {
    if (isFileAccessError(error)) return { kind: 'unopenable' };
    throw error;
  }
}

function isFileAccessError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR' || code === 'ENOTDIR';
}
