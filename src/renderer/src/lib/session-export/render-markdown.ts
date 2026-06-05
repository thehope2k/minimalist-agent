// Static markdown -> HTML for assistant prose. Uses the same unified stack as
// the live <Markdown> component (gfm + math + raw HTML + KaTeX), then walks the
// hast to replace fenced code blocks with self-contained Shiki HTML, and
// mermaid blocks with inline SVG. Output is a plain HTML string.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { toHtml } from 'hast-util-to-html';
import { highlightCode } from './render-code';
import { renderMermaid } from './render-mermaid';
import { MARKDOWN_SANITIZE_SCHEMA } from '../markdown-sanitize-schema';

const MATH_OPTIONS = { singleDollarTextMath: false } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HNode = any;

// The export is uploaded to a *public* share URL and saved as a local file, so
// untrusted model HTML must be sanitized. rehype-raw parses the raw HTML into
// real nodes, rehype-sanitize strips dangerous markup (script/iframe/on*/...),
// and rehype-katex runs *after* so its trusted output survives. `toHtml` keeps
// `allowDangerousHtml` only because replaceCodeBlocks() later injects our own
// (already-safe) Shiki HTML and sanitized mermaid SVG as `raw` nodes.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath, MATH_OPTIONS)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA)
  .use(rehypeKatex);

export async function renderMarkdown(md: string): Promise<string> {
  const mdast = processor.parse(md);
  const hast = (await processor.run(mdast)) as HNode;
  await replaceCodeBlocks(hast);
  return toHtml(hast, { allowDangerousHtml: true });
}

/** Walk the tree; swap each <pre><code class="language-x"> for rendered HTML. */
async function replaceCodeBlocks(node: HNode): Promise<void> {
  if (!node || !Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const code = extractFencedCode(child);
    if (code) {
      node.children[i] = await renderFenced(code.lang, code.value);
      continue;
    }
    await replaceCodeBlocks(child);
  }
}

interface Fenced {
  lang: string;
  value: string;
}

function extractFencedCode(node: HNode): Fenced | null {
  if (!node || node.type !== 'element' || node.tagName !== 'pre') return null;
  const codeEl = (node.children ?? []).find(
    (c: HNode) => c?.type === 'element' && c.tagName === 'code',
  );
  if (!codeEl) return null;
  const className: string[] = codeEl.properties?.className ?? [];
  const langClass = className.find((c) => c.startsWith('language-'));
  const lang = langClass ? langClass.slice('language-'.length) : '';
  const value = collectText(codeEl).replace(/\n$/, '');
  return { lang, value };
}

function collectText(node: HNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (!Array.isArray(node.children)) return '';
  return node.children.map(collectText).join('');
}

async function renderFenced(lang: string, value: string): Promise<HNode> {
  const lower = lang.toLowerCase();
  if (lower === 'mermaid') {
    const svg = await renderMermaid(value);
    if (svg) {
      return raw(`<div class="me-mermaid">${svg}</div>`);
    }
    // fall through to a code block on render failure
  }
  // json/jsonc/datatable -> highlight as json; latex/math handled by KaTeX
  const effective = lower === 'datatable' ? 'json' : lang;
  const html = await highlightCode(value, effective);
  return raw(`<div class="me-codeblock">${html}</div>`);
}

function raw(value: string): HNode {
  return { type: 'raw', value };
}
