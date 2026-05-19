import { useState, useMemo, useCallback } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton, ExpandModal } from '@/components/ui';
import { CodeBlock } from './CodeBlock';

// ── Markdown serialiser ──────────────────────────────────────────────────────

/**
 * Serialise a DataTableSchema to a GitHub-flavoured markdown table.
 *
 * Output is pasteable into Teams (renders natively), Azure DevOps comments
 * (renders natively), Zalo / plain-text chat (pipe chars are readable),
 * and docs (readable as-is). Title is bolded on a line above the table.
 *
 * Example:
 *   **Unbind LINE — Complete**
 *
 *   | Field | Value |
 *   | --- | --- |
 *   | INC Number | INC15268699 |
 *   | Status | ✅ Complete |
 */
function toMarkdownTable(data: DataTableSchema): string {
  const lines: string[] = [];

  if (data.title) {
    lines.push(`**${data.title}**`);
    lines.push('');
  }

  const header = data.columns.map((c) => c.label).join(' | ');
  const sep = data.columns.map(() => '---').join(' | ');
  lines.push(`| ${header} |`);
  lines.push(`| ${sep} |`);

  for (const row of data.rows) {
    const cells = data.columns
      .map((c) => String(row[c.key] ?? '').replace(/\|/g, '\\|'))
      .join(' | ');
    lines.push(`| ${cells} |`);
  }

  return lines.join('\n');
}

// ── Schema ───────────────────────────────────────────────────────────────────

interface DataTableColumn {
  key: string;
  label: string;
  type?: string;
}

interface DataTableSchema {
  title?: string;
  columns: DataTableColumn[];
  rows: Record<string, unknown>[];
}

function parseDataTable(code: string): DataTableSchema | null {
  try {
    const parsed = JSON.parse(code);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.columns) ||
      !Array.isArray(parsed.rows) ||
      parsed.columns.length === 0
    ) {
      return null;
    }
    return parsed as DataTableSchema;
  } catch {
    return null;
  }
}

// ── Inner table ──────────────────────────────────────────────────────────────

function DataTable({ data }: { data: DataTableSchema }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {data.columns.map((col) => (
            <th
              key={col.key}
              className="border-b border-border bg-elevated/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-fg-muted whitespace-nowrap"
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, i) => (
          <tr
            key={i}
            className={cn(i % 2 !== 0 && 'bg-elevated/20')}
          >
            {data.columns.map((col) => {
              const val = row[col.key];
              return (
                <td
                  key={col.key}
                  className="border-b border-border/50 px-3 py-2 align-top text-sm text-fg"
                >
                  {val == null ? '' : String(val)}
                </td>
              );
            })}
          </tr>
        ))}
        {data.rows.length === 0 && (
          <tr>
            <td
              colSpan={data.columns.length}
              className="px-3 py-4 text-center text-sm text-fg-subtle"
            >
              No rows
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

/**
 * Fenced ```datatable block renderer.
 *
 * Expects a JSON payload with shape:
 *   { title?: string; columns: { key, label, type? }[]; rows: object[] }
 *
 * Features:
 *  - Titled header bar with Expand + Copy buttons (hover-revealed).
 *  - Alternating row shading for readability.
 *  - max-h-80 scroll in the chat panel; full-height in the expand modal.
 *  - Row-count footer when the table has more than 8 rows.
 *  - Falls back to a syntax-highlighted CodeBlock for invalid / still-
 *    streaming JSON so rendering never crashes mid-stream.
 */
export function DataTableBlock({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false);
  const handleClose = useCallback(() => setExpanded(false), []);

  const data = useMemo(() => parseDataTable(code), [code]);
  const toMarkdown = useMemo(
    () => (data ? toMarkdownTable(data) : ''),
    [data],
  );

  // Streaming or invalid JSON → degrade gracefully
  if (!data) {
    return <CodeBlock code={code} language="datatable" />;
  }

  const title = data.title ?? 'Table';
  const showFooter = data.rows.length > 8;

  return (
    <>
      <div className="group my-2 overflow-hidden rounded-md border border-border bg-panel">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
          <span className="text-[11px] font-medium text-fg-muted truncate pr-2">
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Expand table"
              aria-label="Expand table"
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
                'text-fg-subtle opacity-0 transition-opacity hover:bg-elevated hover:text-fg group-hover:opacity-100',
              )}
            >
              <Maximize2 className="h-3 w-3" strokeWidth={1.75} />
              Expand
            </button>
            <CopyButton text={toMarkdown} />
          </div>
        </div>

        {/* Table — scrollable in chat context */}
        <div className="scroll-thin max-h-80 overflow-auto">
          <DataTable data={data} />
        </div>

        {/* Row-count footer — only shown when the table is clipped */}
        {showFooter && (
          <div className="border-t border-border/60 px-3 py-1 text-[10px] text-fg-subtle">
            {data.rows.length} rows · scroll or expand to see all
          </div>
        )}
      </div>

      {/* Expand modal — full height, no max-h clipping */}
      {expanded && (
        <ExpandModal title={title} onClose={handleClose}>
          <div className="scroll-thin flex-1 overflow-auto">
            <DataTable data={data} />
          </div>
        </ExpandModal>
      )}
    </>
  );
}
