// Render mermaid source to a static inline SVG (renderer DOM required).
// Mirrors the live MermaidBlock preprocessing so model-emitted quirks parse.
// Returns null on failure so callers can fall back to a code block.

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
  return `me-mermaid-r${renderCounter}-${Date.now().toString(36)}`;
}

function preprocessMermaid(code: string): string {
  return code.replace(/\[([^\[\]]*)\]/g, (match, inner) => {
    const alreadyQuoted = /^"[\s\S]*"$/.test(inner.trim());
    const hasNewline = inner.includes('\\n');
    const hasSpecialChar =
      inner.includes('@') || inner.includes('{') || inner.includes('}');
    if (!hasNewline && !hasSpecialChar) return match;
    if (inner.trimStart().startsWith('(')) {
      const stripped = inner
        .replace(/^\(([\s\S]*)\)$/, '$1')
        .replace(/^"([\s\S]*)"$/, '$1');
      return `[("${stripped.replace(/\\n/g, '<br/>')}")]`;
    }
    const unquoted = alreadyQuoted ? inner.trim().slice(1, -1) : inner;
    const processed = unquoted.replace(/\\n/g, '<br/>');
    return `["${processed}"]`;
  });
}

export async function renderMermaid(code: string): Promise<string | null> {
  if (!code.trim()) return null;
  try {
    const mermaid = await getMermaid();
    const { svg } = await mermaid.render(nextRenderId(), preprocessMermaid(code));
    return svg;
  } catch {
    return null;
  }
}
