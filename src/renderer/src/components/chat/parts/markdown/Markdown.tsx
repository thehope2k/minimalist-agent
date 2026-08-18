import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
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
import { ExpandModal, ZoomPan } from '@/components/ui';
import { createLogger } from '@/lib/logger';
import { useCwd } from '@/contexts/CwdContext';
import { useFileOpener } from '@/contexts/FileOpenerContext';
import { fileUrlToPath } from '@/lib/reference-resolver';
import { useTransientFeedback } from '@/hooks/useTransientFeedback';

const log = createLogger('markdown-link');

/**
 * Assistant-prose renderer.
 *
 * Pipeline:
 *   react-markdown
 *   + remark-gfm       (tables / task lists / strike)
 *   + remark-math      ($$...$$ block math, disabled single-$ to keep
 *                       currency strings like $100 as plain text)
 *   + rehype-raw       (parse inline HTML from the model into the tree)
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
const REHYPE_PLUGINS: PluggableList = [
  rehypeRaw,
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

// ── MarkdownLink ─────────────────────────────────────────────────────────
// `file:` links and bare paths (no scheme at all) get resolved+opened in-app
// (viewer or reveal-in-Finder) via fileOpener instead of being handed to
// shell.openExternal. `file:` survives sanitize only via the explicit
// allowance in markdown-sanitize-schema.ts — see that file for why it's safe
// despite `file:` being a blocked scheme for shell.openExternal itself
// (url-safety.ts remains the fallback gate if fileOpener is unavailable).
// Every genuine external scheme (http, mailto, vscode, ...) keeps the
// original openExternal path unchanged.
// True `scheme:` prefix, e.g. `https:`, `mailto:`, `file:`. A bare relative
// or absolute path (`SKILL.md`, `src/foo.ts`, `/Users/x/y`) has none of
// these, and `new URL(...)` on it throws rather than yielding a URL whose
// protocol we could classify — it is never a genuine external link.
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const [feedback, flash, dismiss] = useTransientFeedback();
  const cwd = useCwd();
  const fileOpener = useFileOpener();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Dismiss the feedback tooltip on outside click / Escape, in addition to
  // its own auto-clear timeout — otherwise it lingers for the full timeout
  // even after the user has clearly moved on and clicked elsewhere.
  useEffect(() => {
    if (!feedback) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) dismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [feedback, dismiss]);

  // No href at all (genuinely empty in the source markdown, e.g. `[text]()`),
  // or a href whose scheme react-markdown's own `defaultUrlTransform` refuses
  // to carry into a real DOM attribute (javascript:/data:/vbscript:/blob:/etc
  // — everything outside its hardcoded https?|ircs?|mailto|xmpp allowlist,
  // and *not* something we handle ourselves as a file reference below).
  // Render inert text rather than a real `<a target="_blank">` in either
  // case: a real anchor whose actual DOM href resolves to "" still has a
  // native click action that navigates to the *current page's own URL*,
  // which Electron's window-open handler then treats as a safe external
  // link and opens in the system browser — a broken-looking "link click
  // reopens the app's dev server URL in Chrome" bug that no JS-level
  // handler can prevent, since a modifier/middle-click bypasses our onClick
  // entirely and there's nothing left to classify at that point.
  const filePath = href ? fileUrlToPath(href) : null;
  const isFileReference = href != null && (filePath !== null || !URL_SCHEME_RE.test(href));
  const safeHref = href ? defaultUrlTransform(href) : '';

  if (!href || (!isFileReference && !safeHref)) {
    return <span className="text-fg-muted">{children}</span>;
  }

  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (isFileReference) {
      // `file:` links (and bare paths) have no meaningful new-tab/new-window
      // behavior, so unlike http(s) links, letting modifier/middle-clicks
      // fall through to the native target="_blank" handling would just
      // navigate to the resolved href — always intercept instead.
      e.preventDefault();
      if (fileOpener) {
        void fileOpener.openReference(href, cwd).then((outcome) => {
          if (!outcome.ok) flash(outcome.reason);
        });
      } else {
        openExternalWithFeedback(href);
      }
      return;
    }

    // Let modifier-clicks on genuine external links fall through to
    // setWindowOpenHandler (which also classifies).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openExternalWithFeedback(href);
  };

  function openExternalWithFeedback(url: string) {
    window.api.app.openExternal(url).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('blocked:', msg);
      flash(msg);
    });
  }

  return (
    // `relative` + absolutely-positioned feedback keeps a failed-click message
    // from being spliced into the surrounding prose as inline text (it used to
    // sit as a flex sibling of the link, widening the line and breaking the
    // sentence mid-flow when the link wasn't at the end of a paragraph).
    <span ref={wrapperRef} className="relative inline-block">
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="text-accent underline-offset-2 hover:underline"
      >
        {children}
      </a>
      {feedback && (
        <span
          role="status"
          className="absolute left-0 top-full z-10 mt-1 w-max max-w-xs rounded border border-border bg-panel px-2 py-1 text-xs text-fg-subtle shadow-lg"
        >
          {feedback}
        </span>
      )}
    </span>
  );
}

// ── Component map ────────────────────────────────────────────────────────────
const COMPONENTS: Components = {
  // Headings — let globals.css typography do the heavy lifting.
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <h2>{children}</h2>,
  h3: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h4>{children}</h4>,

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
}

function MarkdownInner({ text }: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
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
export const Markdown = memo(MarkdownInner, (a, b) => a.text === b.text);
