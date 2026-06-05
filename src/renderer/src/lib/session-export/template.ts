// Assemble the ExportModel into one self-contained HTML document.
// Async because prose/code rendering is async (unified + shiki + mermaid).

import exportCss from './export.css?raw';
import katexCss from 'katex/dist/katex.min.css?raw';
import type {
  ExportAttachment,
  ExportModel,
  ExportPart,
  ExportSubagent,
  ExportTurn,
} from './types';
import { renderMarkdown } from './render-markdown';
import { highlightCode } from './render-code';
import { renderDiff } from './render-diff';
import { MODE_LABELS } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function fmtDuration(ms?: number): string | null {
  if (!ms || ms < 1000) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

// ── Parts ────────────────────────────────────────────────────────────────────

async function renderPart(part: ExportPart): Promise<string> {
  switch (part.kind) {
    case 'text':
      return `<div class="me-md">${await renderMarkdown(part.text)}</div>`;

    case 'thinking':
      return `<details class="me-collapse"><summary>Thinking</summary>` +
        `<div class="me-collapse-body me-md">${await renderMarkdown(part.text)}</div></details>`;

    case 'diff':
      return renderDiffPart(part);

    case 'todo': {
      const items = part.items
        .map((it) => {
          const done = (it.status ?? '').toLowerCase() === 'completed';
          const box = done ? '☑' : '☐';
          return `<li><span class="me-todo-box">${box}</span><span class="${done ? 'done' : ''}">${esc(it.content)}</span></li>`;
        })
        .join('');
      return `<ul class="me-todo">${items}</ul>`;
    }

    case 'tool':
      return renderToolPart(part);
  }
}

async function renderToolPart(
  part: Extract<ExportPart, { kind: 'tool' }>,
): Promise<string> {
  const pieces: string[] = [];
  if (part.inputText) {
    pieces.push(`<div class="me-codeblock">${await highlightCode(part.inputText, 'json')}</div>`);
  }
  if (part.result?.content) {
    const cls = part.result.isError ? 'me-pre me-result-error' : 'me-pre';
    pieces.push(`<pre class="${cls}">${esc(part.result.content)}</pre>`);
  }
  if (part.subagent) {
    pieces.push(await renderSubagent(part.subagent));
  }
  const statusMark =
    part.status === 'error' || part.result?.isError ? ' ✕' : part.status === 'done' ? ' ✓' : ' …';
  return (
    `<details class="me-collapse"><summary><span class="me-tool-name">${esc(part.name)}</span>${statusMark}</summary>` +
    `<div class="me-collapse-body">${pieces.join('')}</div></details>`
  );
}

async function renderSubagent(sub: ExportSubagent): Promise<string> {
  const body: string[] = [];
  for (const p of sub.parts) body.push(await renderPart(p));
  if (sub.error) body.push(`<div class="me-error-box">${esc(sub.error)}</div>`);
  return (
    `<details class="me-collapse" open><summary>Sub-agent: ${esc(sub.agentName)}</summary>` +
    `<div class="me-collapse-body">${body.join('')}</div></details>`
  );
}

function renderDiffPart(part: Extract<ExportPart, { kind: 'diff' }>): string {
  const stats: string[] = [];
  if (part.deletions > 0) stats.push(`<span class="me-diff-stat-del">-${part.deletions}</span>`);
  if (part.additions > 0) stats.push(`<span class="me-diff-stat-add">+${part.additions}</span>`);
  const verb = part.oldValue === '' ? 'Write' : 'Edit';
  const summary =
    `<summary class="me-diff-summary"><b>${verb}</b>${stats.join('')}` +
    `<span class="me-diff-path">${esc(part.filePath)}</span></summary>`;
  const err = part.errorContent
    ? `<pre class="me-pre me-result-error">${esc(part.errorContent)}</pre>`
    : '';
  // Collapsed by default to match the live MI diff chip.
  return (
    `<details class="me-collapse me-diff-details">${summary}` +
    `<div class="me-collapse-body">${renderDiff(part.oldValue, part.newValue)}</div></details>${err}`
  );
}

function renderAttachments(atts: ExportAttachment[]): string {
  const chips = atts
    .map((a) => {
      if (a.dataUri) {
        return `<img src="${a.dataUri}" alt="${esc(a.name)}" />`;
      }
      const kb = a.size ? ` · ${Math.max(1, Math.round(a.size / 1024))} KB` : '';
      return `<span class="me-attach-chip">📎 ${esc(a.name)} (${a.type}${kb}) — not included</span>`;
    })
    .join('');
  return `<div class="me-attach">${chips}</div>`;
}

async function renderTurn(turn: ExportTurn, mode: string): Promise<string> {
  const parts: string[] = [];
  for (const p of turn.parts) parts.push(await renderPart(p));
  if (turn.attachments?.length) parts.push(renderAttachments(turn.attachments));
  if (turn.error) parts.push(`<div class="me-error-box">${esc(turn.error)}</div>`);

  const roleLabel = turn.role === 'user' ? 'You' : 'Assistant';
  const foot: string[] = [];
  if (mode === 'full' && turn.role === 'assistant') {
    if (turn.model) foot.push(esc(turn.model));
    const dur = fmtDuration(turn.durationMs);
    if (dur) foot.push(dur);
  }
  const footHtml = foot.length ? `<div class="me-turn-foot">${foot.join(' · ')}</div>` : '';

  return (
    `<div class="me-turn me-turn-${turn.role}">` +
    `<div class="me-role">${roleLabel}</div>` +
    `<div class="me-body">${parts.join('')}</div>` +
    footHtml +
    `</div>`
  );
}

// ── Document ─────────────────────────────────────────────────────────────────

function renderHeader(model: ExportModel): string {
  const m = model.meta;
  const bits: string[] = [];
  bits.push(`<span><b>${m.messageCount}</b> messages</span>`);
  if (m.models.length) bits.push(`<span>Model: <b>${m.models.map(esc).join(', ')}</b></span>`);
  // Duration is a mechanic — only in the Full Log, not the Conversation.
  if (m.mode === 'full') {
    const dur = fmtDuration(m.totalDurationMs);
    if (dur) bits.push(`<span>Duration: <b>${dur}</b></span>`);
  }
  bits.push(`<span>Exported <b>${esc(fmtDate(m.exportedAt))}</b></span>`);
  return (
    `<header class="me-header"><h1 class="me-title">${esc(m.title)}</h1>` +
    `<div class="me-meta"><span class="me-badge">${esc(MODE_LABELS[m.mode] ?? m.mode)}</span>${bits.join('')}</div></header>`
  );
}

export async function buildHtmlDocument(model: ExportModel): Promise<string> {
  const rows: string[] = [];
  for (const row of model.rows) {
    if (row.kind === 'compaction') {
      rows.push(`<div class="me-compaction">history compacted</div>`);
    } else {
      rows.push(await renderTurn(row.turn, model.meta.mode));
    }
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data: https:; base-uri 'none'; form-action 'none'" />
<meta name="generator" content="Minimalist Agent" />
<title>${esc(model.meta.title)}</title>
<style>${katexCss}</style>
<style>${exportCss}</style>
</head>
<body>
<div class="me-wrap">
${renderHeader(model)}
${rows.join('\n')}
<footer class="me-footer">Exported from Minimalist Agent · ${esc(fmtDate(model.meta.exportedAt))} · static snapshot</footer>
</div>
</body>
</html>`;
}
