import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  canonicalToolName,
  iconForTool,
  summarizeToolCall,
  summarizeToolResult,
} from '@/lib/tool-summary';
import { TodoListPart } from './TodoListPart';
import { DiffPart } from './DiffPart';
import { Markdown } from './markdown/Markdown';

interface ToolPartProps {
  name: string;
  input?: unknown;
  partialInputJson?: string;
  result?: { content: string; isError?: boolean };
  status: 'running' | 'done' | 'error';
}

const RESULT_PREVIEW_LIMIT = 4096;

function formatInput(
  input: unknown,
  partialInputJson: string | undefined,
): string {
  if (input !== undefined && input !== null) {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      /* fall through */
    }
  }
  return partialInputJson ?? '';
}

/**
 * Compact tool-call chip. One line by default; click to expand and see
 * full input + result. Errored tools auto-expand so the user doesn't
 * have to hunt for what broke.
 */
export function ToolPart(props: ToolPartProps) {
  // TodoWrite gets a dedicated checklist renderer — the default JSON-chip
  // view loses the structure of what's actually a list of tasks. We split
  // here (rather than branching inside `ChipBody`) so each branch's hook
  // call order stays stable across re-renders.
  // Tool names arrive in different cases depending on the backend
  // (Anthropic: `Write`/`Edit`/`TodoWrite`; Pi: `write`/`edit`).
  // Compare case-insensitively so both reach the dedicated renderers.
  const lowerName = props.name.toLowerCase();
  if (lowerName === 'todowrite') {
    return <TodoListPart input={props.input} />;
  }
  // Edit / Write get a side-by-side code diff instead of the JSON-chip view —
  // raw `old_string` / `new_string` blobs are unreadable in pre-text form.
  if (lowerName === 'edit' || lowerName === 'write') {
    return (
      <DiffPart
        name={props.name}
        input={props.input}
        result={props.result}
        status={props.status}
      />
    );
  }
  return <ChipBody {...props} />;
}

function ChipBody({
  name,
  input,
  partialInputJson,
  result,
  status,
}: ToolPartProps) {
  const erroredOrFailed = status === 'error' || result?.isError;
  const [open, setOpen] = useState(erroredOrFailed);
  const inputText = formatInput(input, partialInputJson);
  const summary = summarizeToolCall(name, input);
  const resultSummary = summarizeToolResult(name, result);
  const ToolIcon = iconForTool(name);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border text-xs transition-colors',
        erroredOrFailed
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-border bg-elevated/40',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left',
          'hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-90',
          )}
          strokeWidth={2}
        />
        <ToolIcon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            erroredOrFailed ? 'text-red-400' : 'text-fg-muted',
          )}
          strokeWidth={1.75}
        />
        <span
          className={cn(
            'shrink-0 font-medium',
            erroredOrFailed ? 'text-red-300' : 'text-fg',
          )}
        >
          {canonicalToolName(name)}
        </span>
        {summary && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-subtle">
              {summary}
            </span>
          </>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-fg-muted">
          {resultSummary && !open && (
            <span className="text-xs text-fg-subtle">{resultSummary}</span>
          )}
          <StatusIcon status={status} resultIsError={result?.isError} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          {input !== undefined && input !== null ? (
            <InputView input={input} />
          ) : (
            inputText && <CodeFrame label="Input" text={inputText} />
          )}
          {result && (
            <ResultBlock
              toolName={name}
              text={result.content}
              isError={!!result.isError}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Smart input renderer. For plain objects, render each top-level key as
 * a labelled row — short scalars inline, multi-line strings as their own
 * preformatted block. Avoids the `\n`-escape soup of raw JSON pretty-print
 * for tools like Task whose `prompt` field is paragraphs of text.
 *
 * Falls back to JSON pretty-print for non-object inputs.
 */
function InputView({ input }: { input: unknown }) {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input)
  ) {
    let text: string;
    try {
      text = JSON.stringify(input, null, 2);
    } catch {
      text = String(input);
    }
    return <CodeFrame label="Input" text={text} />;
  }
  const entries = Object.entries(input as Record<string, unknown>);
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-subtle">
        Input
      </div>
      <dl className="space-y-1.5 rounded bg-panel px-2 py-1.5">
        {entries.map(([key, value]) => (
          <InputField key={key} field={key} value={value} />
        ))}
      </dl>
    </div>
  );
}

function InputField({ field, value }: { field: string; value: unknown }) {
  const isMultilineString =
    typeof value === 'string' && (value.includes('\n') || value.length > 80);
  const isObjectish = value !== null && typeof value === 'object';

  if (isMultilineString) {
    return (
      <div>
        <dt className="font-mono text-[11px] text-fg-subtle">{field}</dt>
        <dd className="mt-0.5">
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-app/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
            {value as string}
          </pre>
        </dd>
      </div>
    );
  }
  if (isObjectish) {
    let nested: string;
    try {
      nested = JSON.stringify(value, null, 2);
    } catch {
      nested = String(value);
    }
    return (
      <div>
        <dt className="font-mono text-[11px] text-fg-subtle">{field}</dt>
        <dd className="mt-0.5">
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-app/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
            {nested}
          </pre>
        </dd>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-mono text-[11px] text-fg-subtle">
        {field}
      </dt>
      <dd className="min-w-0 flex-1 break-words font-mono text-xs text-fg">
        {value === null || value === undefined
          ? String(value)
          : typeof value === 'string'
            ? value
            : JSON.stringify(value)}
      </dd>
    </div>
  );
}

function StatusIcon({
  status,
  resultIsError,
}: {
  status: 'running' | 'done' | 'error';
  resultIsError?: boolean;
}) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />;
  }
  if (status === 'error' || resultIsError) {
    return <AlertCircle className="h-3 w-3 text-red-400" strokeWidth={2} />;
  }
  return <CheckCircle2 className="h-3 w-3 text-emerald-400" strokeWidth={2} />;
}

function CodeFrame({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
        {text}
      </pre>
    </div>
  );
}

/**
 * Tool results arrive as a string from the SDK, but for MCP tools that
 * string is an envelope (`{isError, content: [{type:'text', text}, ...]}`).
 * Showing the raw envelope is noisy and double-escapes newlines. Unwrap it
 * to the inner text where possible, pretty-print other JSON, and fall back
 * to the original string for plain output.
 */
function normalizeResult(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return text;
  }
  // MCP envelope.
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { content?: unknown }).content)
  ) {
    const blocks = (parsed as { content: Array<{ type?: string; text?: string }> }).content;
    const flattened = blocks
      .map((b) => (b?.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n\n');
    if (flattened) return flattened;
  }
  // Other JSON — pretty-print.
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

/** Tools whose result body is meaningfully markdown — render it rich. */
const MARKDOWN_RESULT_TOOLS = new Set(['task', 'agent']);

function ResultBlock({
  toolName,
  text,
  isError,
}: {
  toolName: string;
  text: string;
  isError: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const display = normalizeResult(text);
  const truncated = display.length > RESULT_PREVIEW_LIMIT && !showAll;
  const view = truncated ? display.slice(0, RESULT_PREVIEW_LIMIT) : display;
  const renderAsMarkdown =
    !isError && MARKDOWN_RESULT_TOOLS.has(toolName.toLowerCase());

  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-subtle">
        {isError ? 'Error' : 'Result'}
      </div>
      {renderAsMarkdown ? (
        <div className="rounded bg-panel px-2 py-1.5 text-sm leading-relaxed text-fg">
          <Markdown text={view + (truncated ? '\n\n…' : '')} />
        </div>
      ) : (
        <pre
          className={cn(
            'scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed',
            isError ? 'text-red-300' : 'text-fg',
          )}
        >
          {view}
          {truncated && '\n…'}
        </pre>
      )}
      {display.length > RESULT_PREVIEW_LIMIT && (
        <button
          type="button"
          className="mt-1 text-xs text-fg-muted hover:text-fg"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? 'Show less'
            : `Show all (${display.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}
