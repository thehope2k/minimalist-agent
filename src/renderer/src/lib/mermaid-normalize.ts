// Single source of truth for normalising model-emitted Mermaid quirks.
// Pure (string -> string), dependency-free, and electron-free so it can be
// unit-tested with plain Node. Consumed by both the live renderer
// (components/.../MermaidBlock.tsx) and the export path
// (lib/session-export/render-mermaid.ts) — keep them importing THIS, never
// re-implement the logic in either place.
//
// Strategy: we do NOT blindly rewrite every diagram. The renderer/export call
// `resolveMermaidSource()`, which first asks Mermaid to `parse()` the original.
// Valid diagrams pass through untouched (zero false positives); only when the
// original fails to parse do we apply `normalizeMermaid()` as a repair pass.
// That lets the repair be aggressive without risking correct diagrams.

/** Characters that break a bare (unquoted) node label and force quote-wrapping. */
const CONFLICT = /[{}@()]/;

/**
 * Edge connectors / operators that separate nodes on a single flowchart line.
 * Splitting on these isolates one node per segment, so we can find a node's
 * matching close delimiter as the LAST delimiter in its segment — which is how
 * we survive nested same-char braces like a `{{n}}` placeholder inside a
 * `{decision}` node. Ordered longest-first so e.g. `-->` wins over `--`.
 */
const CONNECTOR =
  /(\s*(?:<-{1,}>|<={1,}>|<-\.->|-\.->|-\.-|={2,}>|={3,}|-{2,}>|-{2,}x|-{2,}o|-{2,}|:::|&|\|)\s*)/g;

interface Shape {
  open: string;
  close: string;
}

/**
 * Node shape delimiters, ordered longest-open-first so multi-char openers
 * (`[(`, `((`, `{{`, …) match before their single-char prefixes (`[`, `(`, `{`).
 * Trapezoids (`[/…\]`, `[\…/]`) are intentionally omitted — rare, and the
 * parse-gate means an un-repaired diagram just falls back to source rather
 * than rendering wrong.
 */
const SHAPES: Shape[] = [
  { open: '[(', close: ')]' }, // cylinder / database
  { open: '([', close: '])' }, // stadium
  { open: '[[', close: ']]' }, // subroutine
  { open: '((', close: '))' }, // circle
  { open: '{{', close: '}}' }, // hexagon
  { open: '[/', close: '/]' }, // parallelogram
  { open: '[', close: ']' }, // rectangle
  { open: '(', close: ')' }, // round
  { open: '{', close: '}' }, // decision / rhombus
  { open: '>', close: ']' }, // asymmetric (flag)
];

const ID_CHAR = /[A-Za-z0-9_]/;

/** Wrap label content in quotes, normalising `\n` and escaping inner quotes. */
function quoteLabel(inner: string): string {
  const trimmed = inner.trim();
  // Already fully quoted — preserve, but still convert literal `\n`.
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const body = trimmed.slice(1, -1).replace(/\\n/g, '<br/>');
    return `"${body}"`;
  }
  const body = inner.replace(/\\n/g, '<br/>').replace(/"/g, '#quot;');
  return `"${body}"`;
}

/** True if a label needs repair: conflicting chars, a literal `\n`, or stray quotes. */
function needsWrap(inner: string): boolean {
  if (inner.includes('\\n')) return true;
  if (CONFLICT.test(inner)) return true;
  return false;
}

/**
 * Repair a single flowchart segment (one node, post connector-split).
 * Finds `id<open>…<close>` and quote-wraps the label when it would otherwise
 * break the parser. The close delimiter is taken as the LAST occurrence in the
 * segment so nested same-char delimiters (a `{{n}}` inside `{…}`) don't
 * truncate the label early.
 */
function repairSegment(segment: string): string {
  for (let i = 0; i < segment.length; i++) {
    // An opener only starts a node if it directly follows an id character.
    if (i === 0 || !ID_CHAR.test(segment[i - 1])) continue;

    for (const shape of SHAPES) {
      if (!segment.startsWith(shape.open, i)) continue;

      const innerStart = i + shape.open.length;
      const closeIdx = segment.lastIndexOf(shape.close);
      if (closeIdx < innerStart) continue; // no matching close in this segment

      const inner = segment.slice(innerStart, closeIdx);
      if (!needsWrap(inner)) return segment;
      return (
        segment.slice(0, innerStart) +
        quoteLabel(inner) +
        shape.close +
        segment.slice(closeIdx + shape.close.length)
      );
    }
  }
  return segment;
}

/** Repair one logical line: split on connectors, repair each node segment. */
function repairLine(line: string): string {
  const parts = line.split(CONNECTOR);
  // split() with a capturing group interleaves [segment, connector, segment, …].
  return parts
    .map((part, idx) => (idx % 2 === 0 ? repairSegment(part) : part))
    .join('');
}

const FLOW_HEADER = /^\s*(?:flowchart|graph)\b/;

/** First meaningful line tells us the diagram type (skipping frontmatter/init). */
function isFlowchart(code: string): boolean {
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('%%')) continue; // %%{init}%% directives
    if (line === '---') continue; // YAML frontmatter fences
    return FLOW_HEADER.test(raw);
  }
  return false;
}

/**
 * Best-effort repair of model-emitted Mermaid. Only touches flowchart/graph
 * diagrams (other types like xychart/sequence have unrelated label syntax we
 * must not rewrite). Safe to call on already-valid source — idempotent — but
 * intended to run only after the original fails to parse.
 */
export function normalizeMermaid(code: string): string {
  if (!isFlowchart(code)) return code;
  return code.split('\n').map(repairLine).join('\n');
}

/** Minimal shape of the Mermaid module we depend on (avoids importing types). */
interface MermaidParser {
  parse(text: string): unknown | Promise<unknown>;
}

/**
 * Return the source that should be handed to `mermaid.render`. Tries the
 * original first; only if Mermaid rejects it do we return the repaired form.
 * Never throws — a repair that still fails to parse is returned as-is so the
 * subsequent render throws and the caller shows its source fallback.
 */
export async function resolveMermaidSource(
  mermaid: MermaidParser,
  code: string,
): Promise<string> {
  try {
    await mermaid.parse(code);
    return code;
  } catch {
    return normalizeMermaid(code);
  }
}
