// Truncation pass: bound the byte/line size of heavy parts so a single
// runaway tool dump can't bloat the file past host limits or make the page
// sluggish. Presentation (collapse) hides bytes visually; this actually
// removes them. Runs for both modes.
//
// Diffs are kept fuller than raw tool output — they're the point of a
// code-session export.

import type { ExportModel, ExportPart, ExportSubagent } from './types';

interface Caps {
  thinkingLines: number;
  toolResultLines: number;
  toolInputLines: number;
  diffLines: number; // per side
}

const DEFAULT_CAPS: Caps = {
  thinkingLines: 120,
  toolResultLines: 200,
  toolInputLines: 160,
  diffLines: 500,
};

export function truncateModel(
  model: ExportModel,
  caps: Caps = DEFAULT_CAPS,
): ExportModel {
  for (const row of model.rows) {
    if (row.kind !== 'turn') continue;
    for (const part of row.turn.parts) truncatePart(part, caps);
  }
  return model;
}

function truncatePart(part: ExportPart, caps: Caps): void {
  switch (part.kind) {
    case 'thinking':
      part.text = clampLines(part.text, caps.thinkingLines);
      break;
    case 'tool':
      if (part.inputText) {
        part.inputText = clampLines(part.inputText, caps.toolInputLines);
      }
      if (part.result) {
        part.result.content = clampLines(part.result.content, caps.toolResultLines);
      }
      if (part.subagent) truncateSubagent(part.subagent, caps);
      break;
    case 'diff':
      part.oldValue = clampLines(part.oldValue, caps.diffLines);
      part.newValue = clampLines(part.newValue, caps.diffLines);
      if (part.errorContent) {
        part.errorContent = clampLines(part.errorContent, caps.toolResultLines);
      }
      break;
    // text + todo are left intact (assistant prose / task list are the signal).
  }
}

function truncateSubagent(sub: ExportSubagent, caps: Caps): void {
  for (const part of sub.parts) truncatePart(part, caps);
}

/**
 * Keep the head and tail of an over-long block, dropping the middle with a
 * marker. Head-heavy (most context is usually at the top of a dump). Also
 * enforces a char budget so a single giant line (minified JSON, long log
 * line) can't slip past the line-based cap.
 */
function clampLines(text: string, maxLines: number): string {
  const maxChars = maxLines * 240;
  let out = text;
  const lines = out.split('\n');
  if (lines.length > maxLines) {
    const headCount = Math.ceil(maxLines * 0.7);
    const tailCount = maxLines - headCount;
    const trimmed = lines.length - maxLines;
    const head = lines.slice(0, headCount);
    const tail = tailCount > 0 ? lines.slice(lines.length - tailCount) : [];
    out = [
      ...head,
      '',
      `\u2026 ${trimmed.toLocaleString()} line${trimmed === 1 ? '' : 's'} trimmed \u2026`,
      '',
      ...tail,
    ].join('\n');
  }
  if (out.length > maxChars) {
    const dropped = out.length - maxChars;
    out = `${out.slice(0, maxChars)}\n\u2026 ${dropped.toLocaleString()} characters trimmed \u2026`;
  }
  return out;
}
