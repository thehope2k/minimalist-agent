// Shiki highlighter for the static export. Mirrors the live CodeBlock's
// language set + theme so exported code looks like the app. Returns a full
// `<pre class="shiki">…</pre>` string with inline styles (self-contained).

type ShikiHighlighter = {
  codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
};

const LANGS = [
  'bash', 'sh', 'zsh',
  'json', 'jsonc', 'json5',
  'js', 'jsx', 'ts', 'tsx',
  'html', 'css', 'scss',
  'md', 'mdx', 'yaml', 'toml', 'ini',
  'python', 'go', 'rust', 'sql',
  'diff', 'dockerfile', 'graphql', 'xml',
] as const;

const LANG_ALIASES: Record<string, string> = {
  shell: 'bash', console: 'bash', yml: 'yaml', py: 'python', rs: 'rust',
  golang: 'go', typescript: 'ts', javascript: 'js', typescriptreact: 'tsx',
  javascriptreact: 'jsx', plaintext: 'text', txt: 'text', jsonc: 'json',
};

const THEME = 'github-dark-default';

let highlighterPromise: Promise<ShikiHighlighter> | null = null;

async function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = await import('shiki');
      const hl = await shiki.createHighlighter({
        themes: [THEME],
        langs: [...LANGS],
      });
      return hl as unknown as ShikiHighlighter;
    })();
  }
  return highlighterPromise;
}

export function normalizeLang(raw?: string): string {
  if (!raw) return 'text';
  const lower = raw.toLowerCase();
  if (LANG_ALIASES[lower]) return LANG_ALIASES[lower];
  if ((LANGS as readonly string[]).includes(lower)) return lower;
  return lower;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Highlight to a self-contained `<pre>` string; falls back to escaped text. */
export async function highlightCode(code: string, language?: string): Promise<string> {
  const lang = normalizeLang(language);
  if (lang === 'text') {
    return `<pre class="me-code-plain"><code>${escapeHtml(code)}</code></pre>`;
  }
  try {
    const hl = await getHighlighter();
    return hl.codeToHtml(code, { lang, theme: THEME });
  } catch {
    return `<pre class="me-code-plain"><code>${escapeHtml(code)}</code></pre>`;
  }
}
