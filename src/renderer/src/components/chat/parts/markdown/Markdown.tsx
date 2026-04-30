import { memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

/**
 * Assistant-prose renderer.
 *
 * Pipeline: react-markdown + remark-gfm (tables / task lists / strike) +
 * rehype-raw (allow inline HTML). We do not run rehype-sanitize: the
 * model writes the markdown, not the user, so XSS isn't a threat inside
 * an assistant bubble. This keeps the output crisp and lets simple
 * <kbd>, <sub>, <sup>, <details> just work.
 *
 * Streaming-safe: react-markdown is pure and re-runs cleanly on every
 * delta, so we just call it on whatever partial text we have.
 */

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw];

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

const COMPONENTS: Components = {
  // Headings — keep the `markdown` typography pass in globals.css doing
  // the heavy lifting; just render plain tags so they pick it up.
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

  // Inline + fenced code share the `code` element. Inline code has no
  // language class; fenced code (under a `pre`) gets `language-xxx`.
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
    if (lang === 'mermaid') {
      return <MermaidBlock code={code} />;
    }
    return <CodeBlock code={code} language={lang} />;
  },

  // We render fenced code fully inside our `code` handler above, so
  // suppress the surrounding `pre` element react-markdown would emit
  // (it'd nest our styled CodeBlock inside an unstyled <pre>).
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
 * Memoize on text equality. ReactMarkdown isn't cheap on huge inputs
 * (tens of KB), and assistant text-deltas otherwise force a full
 * re-parse on every keystroke from the model.
 */
export const Markdown = memo(MarkdownInner, (a, b) => a.text === b.text);
