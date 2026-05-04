import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
// KaTeX CSS — required for math symbols and layout to render correctly.
import 'katex/dist/katex.min.css';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { JsonBlock } from './JsonBlock';
import { MathBlock } from './MathBlock';
import { ExpandModal, ZoomPan } from '@/components/ui';

/**
 * Assistant-prose renderer.
 *
 * Pipeline:
 *   react-markdown
 *   + remark-gfm       (tables / task lists / strike)
 *   + remark-math      ($$...$$ block math, disabled single-$ to keep
 *                       currency strings like $100 as plain text)
 *   + rehype-raw       (allow inline HTML from the model)
 *   + rehype-katex     (render math nodes to HTML via KaTeX)
 *
 * Custom fenced-code handlers (matched on the language tag):
 *   mermaid        → animated SVG via MermaidBlock (+ expand button)
 *   json           → interactive collapse/expand tree via JsonBlock
 *   latex / math   → KaTeX display-mode block via MathBlock
 *   everything else → Shiki syntax-highlighted CodeBlock (+ expand button)
 *
 * Custom element overrides:
 *   img  → click-to-expand lightbox via ExpandModal
 *
 * Streaming-safe: react-markdown is pure and re-runs cleanly on every
 * delta. JsonBlock / MathBlock fall back to raw text when the fence is
 * still incomplete, so no crash during streaming.
 */

// ── remark-math options ─────────────────────────────────────────────────────
// Disable single-dollar inline math so currency like $2M–$4M stays plain
// text. Double-dollar ($$...$$) still works for real math expressions.
const MATH_OPTIONS = { singleDollarTextMath: false } as const;

const REMARK_PLUGINS = [remarkGfm, [remarkMath, MATH_OPTIONS]] as const;
const REHYPE_PLUGINS = [rehypeRaw, rehypeKatex] as const;

// ── Helper ──────────────────────────────────────────────────────────────────
function extractText(children: ReactNode): string {
  if (children == null) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (
    typeof children === 'object' &&
    'props' in (children as { props?: { children?: ReactNode } }) &&
    (children as { props?: { children?: ReactNode } }).props
  ) {
    return extractText(
      (children as { props: { children?: ReactNode } }).props.children,
    );
  }
  return '';
}

// ── InlineImage ─────────────────────────────────────────────────────────────
// Wraps <img> tags in the markdown with a click-to-expand lightbox.
// Defined as a proper component so it can hold local state.
function InlineImage({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt={alt}
        className="my-2 max-w-full cursor-zoom-in rounded-md border border-border"
        onClick={() => setOpen(true)}
      />
      {open && (
        <ExpandModal title={alt || 'Image'} onClose={() => setOpen(false)}>
          <ZoomPan className="flex-1">
            <div className="flex items-center justify-center p-6">
              <img
                src={src}
                alt={alt}
                className="max-w-full rounded-md"
                style={{ maxHeight: 'calc(90vh - 80px)' }}
                draggable={false}
              />
            </div>
          </ZoomPan>
        </ExpandModal>
      )}
    </>
  );
}

// ── Component map ────────────────────────────────────────────────────────────
const COMPONENTS: Components = {
  // Headings — let globals.css typography do the heavy lifting.
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <h2>{children}</h2>,
  h3: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h4>{children}</h4>,

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),

  // Images — click to expand via ExpandModal lightbox.
  img: ({ src, alt }) => <InlineImage src={src} alt={alt} />,

  /**
   * Inline + fenced code share the `code` element.
   *   - Inline code: no language class → styled <code> tag.
   *   - Fenced code: dispatched by language tag to the right renderer.
   */
  code: ({ className, children, ...rest }) => {
    const match = /language-([\w-]+)/.exec(className ?? '');
    const isInline = !match && !className;

    if (isInline) {
      return (
        <code
          {...rest}
          className="rounded bg-elevated px-1 py-px font-mono text-[0.85em] text-fg"
        >
          {children}
        </code>
      );
    }

    const code = extractText(children).replace(/\n$/, '');
    const lang = match?.[1];

    // ── Fenced block dispatch ──────────────────────────────────────────
    if (lang === 'mermaid') {
      return <MermaidBlock code={code} />;
    }
    if (lang === 'json') {
      // Interactive tree viewer; falls back to Shiki for invalid JSON.
      return <JsonBlock code={code} />;
    }
    if (lang === 'latex' || lang === 'math') {
      // Explicit fenced-block LaTeX (in addition to $$...$$ auto-handled
      // by rehype-katex in the remark pipeline).
      return <MathBlock code={code} />;
    }
    return <CodeBlock code={code} language={lang} />;
  },

  // Suppress the <pre> wrapper — our CodeBlock / MermaidBlock already add
  // their own containers.
  pre: ({ children }) => <>{children}</>,

  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-elevated/60 text-left text-fg-muted">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-1.5 font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-3 py-1.5 align-top">
      {children}
    </td>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-fg-muted">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3 border-border" />,
};

// ── Public component ─────────────────────────────────────────────────────────

interface MarkdownProps {
  text: string;
}

function MarkdownInner({ text }: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Memoize on text equality. ReactMarkdown + the math/KaTeX pipeline is not
 * cheap on huge inputs — assistant text-deltas would otherwise force a full
 * re-parse on every keystroke from the model.
 */
export const Markdown = memo(MarkdownInner, (a, b) => a.text === b.text);
