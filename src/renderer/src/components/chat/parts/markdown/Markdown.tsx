import { memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { MARKDOWN_SANITIZE_SCHEMA } from '@/lib/markdown-sanitize-schema';
// KaTeX CSS — required for math symbols and layout to render correctly.
import 'katex/dist/katex.min.css';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { JsonBlock } from './JsonBlock';
import { MathBlock } from './MathBlock';
import { DataTableBlock } from './DataTableBlock';
import { InlineImage } from './InlineImage';
import { MarkdownLink } from './MarkdownLink';

/**
 * Assistant-prose renderer.
 *
 * Pipeline:
 *   react-markdown
 *   + remark-gfm       (tables / task lists / strike)
 *   + remark-math      ($$...$$ block math, disabled single-$ to keep
 *                       currency strings like $100 as plain text)
 *   + rehype-raw       (parse inline HTML from the model into the tree)
 *   + rehype-slug      (assign a GitHub-style `id` to every heading, so
 *                       in-document TOC links like `[x](#some-heading)`
 *                       have something to scroll to — see MarkdownLink)
 *   + rehype-sanitize  (strip script/iframe/object/form/on /etc. — the
 *                       model is untrusted and renderer XSS = IPC RCE)
 *   + rehype-katex     (render math nodes to HTML via KaTeX — trusted
 *                       output, runs *after* sanitize)
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

const REMARK_PLUGINS: PluggableList = [remarkGfm, [remarkMath, MATH_OPTIONS]];
// Order matters: rehype-raw must parse raw HTML into real nodes *before*
// sanitize inspects the tree, and KaTeX must run *after* sanitize so its rich
// (but trusted) output isn't stripped. See markdown-sanitize-schema.ts for the schema.
const REHYPE_PLUGINS_WITH_RAW_HTML: PluggableList = [
  rehypeRaw,
  rehypeSlug,
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
  rehypeKatex,
];
// Some callers render structured/technical text rather than chat prose,
// where tag-shaped substrings (generics, placeholders) are more likely than
// intentional HTML. rehype-raw turns unrecognized tags into elements that
// sanitize then strips-and-unwraps, collapsing their inner newlines into one
// line. Skipping rehype-raw avoids that: unrecognized tag-shaped text is
// never parsed into a real node, so it's simply omitted, not mangled.
const REHYPE_PLUGINS_NO_RAW_HTML: PluggableList = [
  rehypeSlug,
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
  rehypeKatex,
];

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

// ── Component map ────────────────────────────────────────────────────────────
const COMPONENTS: Components = {
  // Headings — let globals.css typography do the heavy lifting.
  h1: ({ id, children }) => <h1 id={id}>{children}</h1>,
  h2: ({ id, children }) => <h2 id={id}>{children}</h2>,
  h3: ({ id, children }) => <h3 id={id}>{children}</h3>,
  h4: ({ id, children }) => <h4 id={id}>{children}</h4>,

  a: MarkdownLink,

  // Images — click to expand via ExpandModal lightbox.
  img: ({ src, alt }) => <InlineImage src={src} alt={alt} />,

  /**
   * Inline + fenced code share the `code` element.
   *   - Inline code: no language class → styled <code> tag.
   *   - Fenced code: dispatched by language tag to the right renderer.
   */
  code: ({ className, children, ...rest }) => {
    const match = /language-([\w-]+)/.exec(className ?? '');
    const rawCode = extractText(children);
    // react-markdown always appends a trailing \n to fenced-block code but
    // never to inline code. This is the most reliable way to tell them apart
    // when no language tag is present (className would be undefined for both).
    const isInline = !match && !rawCode.endsWith('\n');

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

    const code = rawCode.replace(/\n$/, '');
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
    if (lang === 'datatable') {
      // Structured table: { title?, columns: [{key,label}], rows: [{}] }
      // Used by skills to emit rich summary tables (e.g. @png-ciam-l3-*).
      return <DataTableBlock code={code} />;
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
  /** Set false for structured/technical text where raw-HTML parsing would
   *  misfire on tag-shaped placeholders (see REHYPE_PLUGINS_NO_RAW_HTML). */
  allowRawHtml?: boolean;
}

function MarkdownInner({ text, allowRawHtml = true }: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={allowRawHtml ? REHYPE_PLUGINS_WITH_RAW_HTML : REHYPE_PLUGINS_NO_RAW_HTML}
        components={COMPONENTS}
        // react-markdown runs its own `defaultUrlTransform` on href/src
        // *after* our rehypeSanitize pass, independent of it, using a
        // hardcoded protocol allowlist (no `file`) we have no way to widen
        // from the sanitize schema — it would silently re-blank `file:`
        // hrefs that rehypeSanitize just finished letting through. Pass the
        // value straight through instead: MarkdownLink's own classification
        // and the `shell:openExternal` IPC chokepoint (url-safety.ts) are
        // the actual security boundary for link destinations; rehypeSanitize
        // above still strips the dangerous *markup* (script/on*/etc.).
        urlTransform={(value) => value}
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
export const Markdown = memo(MarkdownInner, (a, b) => a.text === b.text && a.allowRawHtml === b.allowRawHtml);
