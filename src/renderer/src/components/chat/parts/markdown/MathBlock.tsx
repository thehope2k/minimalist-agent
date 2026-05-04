import { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

/**
 * Block math renderer for explicit ```latex / ```math fenced code blocks.
 *
 * Uses KaTeX in display mode so the expression is centred and sized for
 * standalone viewing. Inline / block $$...$$ math is handled upstream by
 * rehype-katex in the Markdown pipeline — this component only handles the
 * explicit fenced-block case.
 *
 * On parse error, shows the raw LaTeX source so the user can spot the
 * typo instead of seeing a blank block.
 */

/**
 * Sanitise raw LaTeX before handing it to KaTeX.
 *
 * KaTeX is a renderer, not a full TeX engine, so several common authoring
 * habits break it:
 *   1. `%` line comments are valid TeX but KaTeX errors on them.
 *   2. `\[...\]` / `$$...$$` display-math wrappers are redundant when we
 *      already use displayMode:true — and if `\]` appears mid-block
 *      (closing only the first of several equations) KaTeX hard-fails.
 *   3. Multi-equation blocks (separated by blank lines) need wrapping in
 *      `\begin{gathered}...\end{gathered}` so KaTeX stacks them cleanly.
 */
function preprocessLatex(raw: string): string {
  // 1. Strip % comments — but not \% which is a literal percent sign.
  let code = raw.replace(/(?<!\\)%[^\n]*/g, '');

  // 2. Remove all \[ \] and $$ display-math delimiters (global, not anchored —
  //    they can appear mid-block when the AI writes multiple equations).
  code = code
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '')
    .replace(/\$\$/g, '');

  // 3. Split on blank lines into individual equation blocks. Within each block,
  //    join lines with a space so multi-line equations stay as one expression.
  const blocks = code
    .split(/\n{2,}/)
    .map((b) =>
      b
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean);

  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0];

  // 4. Multiple equations → stack them with \begin{gathered} so KaTeX
  //    renders them vertically without needing a full align environment.
  return `\\begin{gathered}\n${blocks.join(' \\\\ ')}\n\\end{gathered}`;
}

export function MathBlock({ code }: { code: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(preprocessLatex(code), {
        displayMode: true,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return null;
    }
  }, [code]);

  if (!html) {
    return (
      <pre
        className={cn(
          'my-2 overflow-x-auto rounded-md border border-border bg-panel',
          'px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-muted',
        )}
      >
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="katex-display-block my-2 overflow-x-auto rounded-md border border-border bg-panel px-4 py-3 text-center text-fg"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
