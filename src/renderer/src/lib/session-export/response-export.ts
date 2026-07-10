import type { MessagePart } from '../chat';
import { renderMarkdown } from './render-markdown';
import exportCss from './export.css?raw';
import katexCss from 'katex/dist/katex.min.css?raw';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

/**
 * Extract the conclusion from a turn's parts — all text blocks after the last
 * tool call. Falls back to all text if the turn has no tool calls. Returns null
 * when no text exists.
 */
export function extractConclusion(parts: MessagePart[]): string | null {
  const lastToolIdx = parts.reduceRight(
    (acc, p, i) => (acc === -1 && p.kind === 'tool' ? i : acc),
    -1,
  );

  const conclusionParts = parts
    .slice(lastToolIdx + 1)
    .filter((p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text');

  if (conclusionParts.length > 0) {
    return conclusionParts.map((p) => p.text).join('\n\n');
  }

  // No text after the last tool — fall back to any text in the turn
  const anyText = parts.filter(
    (p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text',
  );
  return anyText.length > 0 ? anyText.map((p) => p.text).join('\n\n') : null;
}

function titleFromMarkdown(md: string): string {
  const firstLine = md.split('\n').find((l) => l.trim()) ?? '';
  return firstLine.replace(/^#+\s*/, '').replace(/[*_`]/g, '').slice(0, 80).trim() || 'Response';
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'response'
  );
}

export interface ResponseExportResult {
  html: string;
  markdown: string;
  suggestedName: string;
}

export async function buildResponseHtml(
  markdown: string,
  title?: string,
): Promise<ResponseExportResult> {
  const resolvedTitle = title || titleFromMarkdown(markdown);
  const contentHtml = await renderMarkdown(markdown);
  const exportedAt = formatDate(Date.now());
  const suggestedName = `${slugify(resolvedTitle)}-response-${new Date().toISOString().slice(0, 10)}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data: https:; base-uri 'none'; form-action 'none'" />
<meta name="generator" content="Minimalist Agent" />
<title>${esc(resolvedTitle)}</title>
<style>${katexCss}</style>
<style>${exportCss}</style>
<style>
  body { background: #111113; }
  .resp-wrap { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
  .resp-footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,.08); font-size: .75rem; color: #666; }
</style>
</head>
<body>
<div class="resp-wrap">
<div class="me-md">${contentHtml}</div>
<div class="resp-footer">Shared from Minimalist Agent · ${esc(exportedAt)}</div>
</div>
</body>
</html>`;

  return { html, markdown, suggestedName };
}
