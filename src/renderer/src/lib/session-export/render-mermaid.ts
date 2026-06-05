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
    return sanitizeSvg(svg);
  } catch {
    return null;
  }
}

/**
 * Harden a mermaid-produced SVG before it is injected (as raw HTML) into the
 * shared/exported document. Mermaid's `antiscript` level already strips
 * `<script>` and javascript: links, but the export bypasses the markdown
 * sanitizer for this SVG, so we defensively re-strip: drop `<script>` nodes,
 * remove every `on*` event-handler attribute, and neutralize `javascript:`
 * URLs in href / xlink:href. Returns null if the SVG can't be parsed cleanly,
 * so the caller falls back to a code block rather than emitting unknown markup.
 */
function sanitizeSvg(svg: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;

  const scrub = (el: Element): void => {
    if (el.tagName.toLowerCase() === 'script') {
      el.remove();
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/\s+/g, '').toLowerCase();
      const isUrlAttr = name === 'href' || name === 'xlink:href' || name === 'src';
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (isUrlAttr && value.startsWith('javascript:')) el.removeAttribute(attr.name);
    }
    for (const child of Array.from(el.children)) scrub(child);
  };
  scrub(root);

  return new XMLSerializer().serializeToString(root);
}
