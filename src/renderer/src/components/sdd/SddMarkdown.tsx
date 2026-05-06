/**
 * Shared markdown renderer for SDD artifact viewers (features + constitution).
 * All components except interactive checkboxes live here — checkboxes are
 * feature-viewer-specific and injected via `extraComponents`.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { CodeBlock } from '@/components/chat/parts/markdown/CodeBlock';

// ── Text extraction ───────────────────────────────────────────────────────────

/**
 * Recursively extract plain text from a React node tree.
 * String(children) produces "[object Object]" for element arrays — this
 * gives the real concatenated text so STOP/Given/When/Then patterns work
 * on paragraphs with inline bold, em, code, etc.
 */
export function extractText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

// ── Shared markdown component map ─────────────────────────────────────────────

export const SDD_MD_COMPONENTS: Components = {
  // ── Headings — clear size + brightness hierarchy ──────────────────────────
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-fg mt-6 mb-3 pb-1.5 border-b border-border">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[13px] font-bold text-fg uppercase tracking-widest mt-5 mb-2 pb-1 border-b border-border/50">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-fg mt-4 mb-1.5">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[13px] font-semibold text-fg-muted mt-3 mb-1">{children}</h4>
  ),

  // ── Paragraphs — muted body so bold/headings pop ──────────────────────────
  p: ({ children }) => {
    const text = extractText(children);
    if (/^\*\*STOP[:\s]/i.test(text) || /^STOP[:\s]/i.test(text)) {
      return (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 my-2.5">
          <span className="text-amber-400 text-[10px] font-bold shrink-0 mt-0.5">▶ STOP</span>
          <p className="text-sm text-fg-muted leading-relaxed">{children}</p>
        </div>
      );
    }
    const isScenario = /^\*\*(Given|When|Then|And)\*\*/.test(text);
    return (
      <p className={isScenario
        ? 'text-sm text-fg-muted pl-3 border-l-2 border-accent/50 my-1.5 leading-relaxed'
        : 'text-sm text-fg-muted my-2 leading-relaxed'
      }>{children}</p>
    );
  },

  // ── Lists — muted body text; strong inside will still pop ────────────────
  ul: ({ children }) => <ul className="my-2 ml-4 space-y-1 list-disc list-outside">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-4 space-y-1 list-decimal list-outside">{children}</ol>,
  li: ({ children }) => <li className="text-sm text-fg-muted pl-1 leading-relaxed">{children}</li>,

  // ── Inline emphasis — strong pops bright from muted body ─────────────────
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic text-fg-muted">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer">{children}</a>
  ),
  hr: () => <hr className="border-border/60 my-5" />,

  // ── Code — accent tint makes identifiers stand out ───────────────────────
  code: ({ children, className }) => {
    const match = /language-([\w-]+)/.exec(className ?? '');
    const rawCode = typeof children === 'string' ? children : extractText(children);
    const isInline = !match && !rawCode.endsWith('\n');

    if (isInline) {
      return (
        <code className="text-accent/90 bg-accent/10 border border-accent/20 rounded px-1 py-px text-[0.82em] font-mono">{children}</code>
      );
    }

    const code = rawCode.replace(/\n$/, '');
    const lang = match?.[1];
    return <CodeBlock code={code} language={lang} />;
  },
  // CodeBlock renders its own container — suppress the default <pre> wrapper
  pre: ({ children }) => <>{children}</>,

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/60 bg-accent/5 px-3 py-2 my-2.5 rounded-r text-sm text-fg-muted italic">{children}</blockquote>
  ),

  // ── Tables ────────────────────────────────────────────────────────────────
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-md border border-border/60">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border bg-elevated/60">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border/40">{children}</tbody>,
  th: ({ children }) => <th className="px-3 py-2 text-left text-[11px] font-semibold text-fg uppercase tracking-widest">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 text-sm text-fg-muted">{children}</td>,
  tr: ({ children }) => <tr className="hover:bg-elevated/40 transition-colors">{children}</tr>,
};

// ── Renderer component ────────────────────────────────────────────────────────

interface SddMarkdownContentProps {
  content: string;
  /** Scoped DOM id for checkbox index queries (task lists). */
  id?: string;
  /** Additional or override components — merged over the shared base. */
  extraComponents?: Partial<Components>;
}

export function SddMarkdownContent({ content, id, extraComponents }: SddMarkdownContentProps) {
  const components = extraComponents
    ? { ...SDD_MD_COMPONENTS, ...extraComponents }
    : SDD_MD_COMPONENTS;

  return (
    <div id={id} className="sdd-task-list min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
