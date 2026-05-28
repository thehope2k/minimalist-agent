import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton, ExpandModal, ZoomPan } from '@/components/ui';

/**
 * Lazy-loaded Mermaid renderer. Mermaid pulls ~1MB of JS so we only
 * import it the first time a ```mermaid block hits the screen.
 *
 * Rendering is debounced via React state, and we swallow parse errors —
 * incomplete diagrams (very common while the model is still streaming
 * the fence body) just fall back to showing the raw source until the
 * next render attempt succeeds.
 */
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let initialized = false;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      // 'antiscript' sanitizes <script> tags but allows <br/> and other safe
      // HTML in labels — needed for our \n → <br/> preprocessing below.
      // 'strict' would block all HTML and make multiline labels impossible.
      securityLevel: 'antiscript',
      theme: 'dark',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif',
      flowchart: { htmlLabels: true },
    });
    initialized = true;
  }
  return mermaid;
}

let renderCounter = 0;
function nextRenderId(): string {
  renderCounter += 1;
  return `mermaid-r${renderCounter}-${Date.now().toString(36)}`;
}

/**
 * Normalise common model-generated Mermaid quirks before handing to the parser.
 *
 * 1. Literal `\n` inside node labels → `<br/>` + quote-wrap so the Mermaid
 *    parser accepts the HTML angle brackets.
 * 2. `@` or `/` inside an unquoted bracket label (common with npm scoped
 *    package names like `[@scope/pkg]`) → quote-wrap, because `@` is not a
 *    valid bare character in Mermaid label syntax and causes a parse error.
 *
 * Special case: cylinder / database shapes use `[("...")]` or `[(...))]`.
 * We must preserve the `(…)` delimiters or Mermaid will lose the shape
 * and potentially produce an unmatched-quote parse error.
 */
function preprocessMermaid(code: string): string {
  // Match bracket node labels: [content] or ["content"] — no nested brackets.
  return code.replace(/\[([^\[\]]*)\]/g, (match, inner) => {
    const alreadyQuoted = /^"[\s\S]*"$/.test(inner.trim());
    const hasNewline = inner.includes('\\n');
    // `@` is illegal in bare labels; `/` alongside `@` appears in scoped pkg names.
    // `{` `}` are special chars for decision nodes and break template syntax like {{variable}}.
    const hasSpecialChar = inner.includes('@') || inner.includes('{') || inner.includes('}');

    if (!hasNewline && !hasSpecialChar) return match;

    // Cylinder / database shape [(...)] or [("...")] — preserve the (…) wrapper.
    if (inner.trimStart().startsWith('(')) {
      const stripped = inner
        .replace(/^\(([\s\S]*)\)$/, '$1')  // remove outer parens
        .replace(/^"([\s\S]*)"$/, '$1');   // remove optional surrounding quotes
      return `[("${stripped.replace(/\\n/g, '<br/>')}")]`;
    }

    // Strip existing surrounding quotes (if any), replace \n, re-quote.
    const unquoted = alreadyQuoted ? inner.trim().slice(1, -1) : inner;
    const processed = unquoted.replace(/\\n/g, '<br/>');
    return `["${processed}"]`;
  });
}

export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [showSource, setShowSource] = useState(false);
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
    setErrored(false);
    if (!code.trim()) {
      setSvg(null);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const mermaid = await getMermaid();
        if (cancelled || !mounted.current) return;
        // mermaid.render appends a temp node to the DOM under the hood —
        // its render ids must be unique per call.
        const { svg: rendered } = await mermaid.render(nextRenderId(), preprocessMermaid(code));
        if (!cancelled && mounted.current) {
          setSvg(rendered);
          setErrored(false);
        }
      } catch {
        if (!cancelled && mounted.current) {
          setErrored(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Escape closes the expanded overlay — delegated to ExpandModal.

  if (errored || svg === null) {
    // Either still loading on the very first paint, or the diagram is
    // partial / broken. Show the raw source — also lets the user copy
    // it out if rendering keeps failing.
    return (
      <div className="my-2 overflow-hidden rounded-md border border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          <span>{errored ? 'mermaid (cannot render)' : 'mermaid'}</span>
          <div className="flex items-center gap-0.5">
            {errored && (
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="flex items-center gap-1 hover:text-fg"
              >
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform',
                    showSource && 'rotate-180',
                  )}
                />
                {showSource ? 'Hide source' : 'Show source'}
              </button>
            )}
            <CopyButton text={code} />
          </div>
        </div>
        {(!errored || showSource) && (
          <pre className="scroll-thin m-0 overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-muted">
            <code>{code}</code>
          </pre>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="group relative my-2 overflow-x-auto rounded-md border border-border bg-panel p-3">
        <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
        {/* Expand button — fades in on hover */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expand diagram"
          aria-label="Expand diagram"
          className={cn(
            'absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md',
            'text-fg-subtle opacity-0 transition-opacity',
            'hover:bg-elevated hover:text-fg',
            'group-hover:opacity-100',
          )}
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <CopyButton text={code} className="absolute right-9 top-2" />
      </div>

      {expanded && (
        <ExpandModal title="Diagram" onClose={() => setExpanded(false)} className="w-[min(95vw,1800px)] h-[90vh]">
          <ZoomPan className="flex-1" fitOnMount>
            {/* SVG rendered at its natural dimensions — ZoomPan scales to fit on open */}
            <div
              className="flex items-center justify-center p-6"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </ZoomPan>
        </ExpandModal>
      )}
    </>
  );
}
