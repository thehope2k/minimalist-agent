import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      securityLevel: 'strict',
      theme: 'dark',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif',
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

export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [showSource, setShowSource] = useState(false);
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
        const { svg: rendered } = await mermaid.render(nextRenderId(), code);
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

  if (errored || svg === null) {
    // Either still loading on the very first paint, or the diagram is
    // partial / broken. Show the raw source — also lets the user copy
    // it out if rendering keeps failing.
    return (
      <div className="my-2 overflow-hidden rounded-md border border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          <span>{errored ? 'mermaid (cannot render)' : 'mermaid'}</span>
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
    <div
      className="my-2 flex justify-center overflow-x-auto rounded-md border border-border bg-panel p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
