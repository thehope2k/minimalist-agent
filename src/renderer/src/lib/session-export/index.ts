// Public entry for the session HTML exporter. Orchestrates the pipeline:
//   select -> redact -> truncate -> render document.

import type { SessionMeta, StoredMessage } from '../electron';
import type { ExportOptions } from './types';
import { buildExportModel } from './select';
import { redactModel } from './redact';
import { truncateModel } from './truncate';
import { buildHtmlDocument } from './template';
import { MODE_SLUGS } from './types';

export type { ExportMode, ExportOptions } from './types';
export { MODE_LABELS, MODE_SLUGS } from './types';

export interface ExportResult {
  html: string;
  /** Sanitized filename suggestion (no extension). */
  suggestedName: string;
  messageCount: number;
}

export async function exportSessionHtml(
  meta: SessionMeta,
  messages: StoredMessage[],
  options: ExportOptions,
): Promise<ExportResult> {
  let model = buildExportModel(meta, messages, options);
  model = redactModel(model);
  model = truncateModel(model);
  const html = await buildHtmlDocument(model);
  return {
    html,
    suggestedName: suggestName(meta.title, options.mode),
    messageCount: model.meta.messageCount,
  };
}

function suggestName(title: string, mode: string): string {
  const slug = (title || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'session';
  const date = new Date().toISOString().slice(0, 10);
  const modeSlug = MODE_SLUGS[mode as keyof typeof MODE_SLUGS] ?? mode;
  return `${slug}-${modeSlug}-${date}`;
}
