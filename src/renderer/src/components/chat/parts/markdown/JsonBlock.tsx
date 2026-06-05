import { useState, useMemo, useCallback } from 'react';
import JsonView from '@uiw/react-json-view';
import { vscodeTheme } from '@uiw/react-json-view/vscode';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from './CodeBlock';

/**
 * Interactive JSON tree viewer for ```json code blocks.
 *
 * Parses the raw JSON string and renders it with @uiw/react-json-view —
 * collapsible nodes, copy-per-value, and a header copy button matching
 * CodeBlock's chrome. Falls back to the standard Shiki CodeBlock for
 * invalid JSON so streaming partial blocks don't crash.
 *
 * Deeply parses stringified JSON-within-JSON so nested objects stored as
 * strings (common in tool results) are rendered as expandable nodes.
 */

// Theme aligned to the app's OKLCH dark tokens.
const JSON_THEME = {
  ...vscodeTheme,
  '--w-rjv-font-family':
    '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  '--w-rjv-font-size': '12px',
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-line-height': '1.6',
} as const;

/**
 * Recursively parse stringified JSON within JSON values.
 * Common in MCP tool results: {"result": "{\"nested\": \"value\"}"}
 * becomes an expandable node instead of a raw string.
 */
function deepParseJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']'))
    ) {
      try {
        return deepParseJson(JSON.parse(t));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(deepParseJson);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = deepParseJson(v);
    }
    return result;
  }
  return value;
}

export function JsonBlock({ code, embedded = false }: { code: string; embedded?: boolean }) {
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    try {
      return deepParseJson(JSON.parse(code)) as object;
    } catch {
      return null;
    }
  }, [code]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard denied — silently ignore */
    }
  }, [code]);

  // Invalid or still-streaming JSON → fall back to Shiki CodeBlock
  if (parsed === null) {
    return <CodeBlock code={code} language="json" embedded={embedded} />;
  }

  if (embedded) {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 py-3">
        <JsonView
          value={parsed}
          style={JSON_THEME}
          collapsed={2}
          enableClipboard={false}
          displayDataTypes={false}
          shortenTextAfterLength={120}
        />
      </div>
    );
  }

  return (
    <div className="group my-2 overflow-hidden rounded-md border border-border bg-panel">
      {/* Header chrome — matches CodeBlock style */}
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
        <span>json</span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
            'text-fg-subtle opacity-0 transition-opacity hover:bg-elevated hover:text-fg group-hover:opacity-100',
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Interactive tree */}
      <div className="scroll-thin overflow-x-auto px-3 py-2">
        <JsonView
          value={parsed}
          style={JSON_THEME}
          collapsed={2}
          enableClipboard={false}
          displayDataTypes={false}
          shortenTextAfterLength={120}
        />
      </div>
    </div>
  );
}
