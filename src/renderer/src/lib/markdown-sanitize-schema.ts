import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Shared sanitize schema for untrusted model-authored markdown.
 *
 * Two pipelines render the same untrusted content and so share this schema:
 *   - the live chat view (`components/.../markdown/Markdown.tsx`), where a
 *     script primitive reaches the entire `window.api` IPC surface
 *     (PTY spawn, arbitrary-path file read) — i.e. XSS = local code exec; and
 *   - the session exporter (`lib/session-export/render-markdown.ts`), whose
 *     output is uploaded to a *public* share URL and saved as a `file://`
 *     document — i.e. XSS = stored XSS for anyone who opens it.
 *
 * Both run `rehype-raw` → `rehype-sanitize(this)` → `rehype-katex`. We start
 * from `rehype-sanitize`'s GitHub-derived `defaultSchema`, a strict allowlist
 * that already drops the live vectors: `script`, `iframe`, `object`, `embed`,
 * `form`, `meta`, `link`, `base`, `style`, and all `on*` handlers / non-http(s)
 * URL schemes. Only one widening is needed:
 *
 *   `rehype-katex` runs *after* sanitize, so its rich output is trusted. But
 *   its *input* — the `<code class="language-math math-display">` / `math-inline`
 *   wrappers emitted by `remark-math` — must survive sanitization, or block
 *   math silently degrades to inline. The default `code` schema only allows
 *   `language-*`, so we also permit the two math marker classes.
 */
export const MARKDOWN_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-display', 'math-inline']],
  },
};
