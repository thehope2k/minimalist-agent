import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Sanitize schema for assistant-prose markdown.
 *
 * The model's output is untrusted: any markup that survives here renders in
 * the renderer, where a single script primitive reaches the entire
 * `window.api` IPC surface (PTY spawn, arbitrary-path file read). So renderer
 * XSS is effectively local code execution — sanitizing the raw HTML that
 * `rehype-raw` parses is the linchpin defense.
 *
 * We start from `rehype-sanitize`'s GitHub-derived `defaultSchema`, a strict
 * allowlist that already drops the live vectors: `script`, `iframe`,
 * `object`, `embed`, `form`, `meta`, `link`, `base`, `style`, and all `on*`
 * handlers / non-http(s) URL schemes. Only one extension is needed:
 *
 *   `rehype-katex` runs *after* this sanitizer (see `REHYPE_PLUGINS`), so its
 *   rich output is trusted. But its *input* — the `<code class="language-math
 *   math-display">` / `math-inline` wrappers emitted by `remark-math` — must
 *   survive sanitization, or block math silently degrades to inline. The
 *   default `code` schema only allows `language-*`, so we widen it to also
 *   permit the two math marker classes.
 */
export const MARKDOWN_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-display', 'math-inline']],
  },
};
