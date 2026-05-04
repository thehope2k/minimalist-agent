import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExpandModal } from '@/components/ui';

/**
 * Lazy-loaded Shiki highlighter. We keep a singleton across the app so
 * grammars/themes load once. Languages are resolved on demand and cached
 * inside the highlighter; first render of a new language is async.
 *
 * Curated language list — pulling the long tail (Java, Kotlin, Swift…)
 * is fine but keeps cold-start lean for the typical coding-agent diet.
 */
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
  // Short aliases
  shell: 'bash',
  console: 'bash',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  golang: 'go',
  // Full language names the AI commonly writes that aren't in LANGS directly
  typescript: 'ts',
  javascript: 'js',
  typescriptreact: 'tsx',
  javascriptreact: 'jsx',
  plaintext: 'text',
  txt: 'text',
};

const THEME = 'github-dark-default';

type ShikiHighlighter = {
  codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
  loadLanguage?: (lang: string) => Promise<void>;
};

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

function normalizeLang(raw?: string): string {
  if (!raw) return 'text';
  const lower = raw.toLowerCase();
  if (LANG_ALIASES[lower]) return LANG_ALIASES[lower];
  if ((LANGS as readonly string[]).includes(lower)) return lower;
  // Unknown language: pass through to Shiki — it knows many more aliases
  // (e.g. 'c', 'cpp', 'java', 'kotlin'…). The async effect's catch block
  // falls back to plain text if Shiki doesn't recognise it.
  return lower;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

/**
 * Fenced-code renderer. Renders an instant plain-mono fallback, then
 * upgrades to Shiki-highlighted HTML when the highlighter resolves.
 * That makes streaming feel zero-latency: each delta repaints the
 * fallback, and the highlight kicks in once the block stabilizes.
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const lang = normalizeLang(language);
  const [html, setHtml] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (lang === 'text') {
      setHtml(null);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const hl = await getHighlighter();
        if (cancelled || !mounted.current) return;
        const out = hl.codeToHtml(code, { lang, theme: THEME });
        if (!cancelled && mounted.current) setHtml(out);
      } catch {
        if (!cancelled && mounted.current) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return (
    <>
      <div className="group relative my-2 overflow-hidden rounded-md border border-border bg-[#0d1117]">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          <span>{language || 'text'}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Expand"
              aria-label="Expand code"
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
                'text-fg-subtle opacity-0 transition-opacity hover:bg-elevated hover:text-fg group-hover:opacity-100',
              )}
            >
              <Maximize2 className="h-3 w-3" strokeWidth={1.75} />
              Expand
            </button>
            <CopyButton text={code} />
          </div>
        </div>
        {html ? (
          <div
            className="shiki-host scroll-thin overflow-x-auto px-3 py-2 text-[12.5px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="scroll-thin m-0 overflow-x-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg">
            <code>{code}</code>
          </pre>
        )}
      </div>

      {expanded && (
        <ExpandModal title={language || 'text'} onClose={() => setExpanded(false)}>
          <div className="scroll-thin flex-1 overflow-auto bg-[#0d1117]">
            {html ? (
              <div
                className="shiki-host px-4 py-3 text-[12.5px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <pre className="m-0 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg">
                <code>{code}</code>
              </pre>
            )}
          </div>
        </ExpandModal>
      )}
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
        'text-fg-subtle opacity-0 transition-opacity hover:bg-elevated hover:text-fg group-hover:opacity-100',
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard may be denied; silently ignore */
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
