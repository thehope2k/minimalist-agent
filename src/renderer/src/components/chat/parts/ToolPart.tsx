import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessagePart, SubagentTranscript } from '@/lib/chat';
import {
  canonicalToolName,
  iconForTool,
  summarizeToolCall,
  summarizeToolResult,
} from '@/lib/tool-summary';
import { TodoListPart } from './TodoListPart';
import { DiffPart } from './DiffPart';
import { Markdown } from './markdown/Markdown';
import { ThinkingPart } from './ThinkingPart';
import { ExpandModal } from '@/components/ui';

interface ToolPartProps {
  name: string;
  input?: unknown;
  partialInputJson?: string;
  result?: { content: string; isError?: boolean };
  status: 'running' | 'done' | 'error';
  subagent?: SubagentTranscript;
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
  subagent,
}: ToolPartProps) {
  const erroredOrFailed = status === 'error' || result?.isError;
  const [open, setOpen] = useState(erroredOrFailed);
  const inputText = formatInput(input, partialInputJson);
  const summary = summarizeToolCall(name, input);
  const resultSummary = summarizeToolResult(name, result);
  const ToolIcon = iconForTool(name);
  const isAgentTool = canonicalToolName(name) === 'Agent';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border text-xs transition-colors',
        erroredOrFailed
          ? 'border-red-500/30 bg-red-500/5'
          : isAgentTool
            ? 'border-accent/40 bg-elevated/40'
            : 'border-border bg-elevated/40',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left',
          isAgentTool
            ? 'bg-accent/10 hover:bg-accent/15 focus-visible:bg-accent/15'
            : 'hover:bg-elevated focus-visible:bg-elevated',
          'focus-visible:outline-none',
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
          {subagent && <SubagentSummaryLine subagent={subagent} />}
          {isAgentTool ? (
            <TaskInputSection
              input={input}
              partialInputJson={partialInputJson}
              summary={summary}
            />
          ) : input !== undefined && input !== null ? (
            <InputView input={input} />
          ) : (
            inputText && <CodeFrame label="Input" text={inputText} />
          )}
          {subagent && <SubagentTranscriptView subagent={subagent} />}
          {result && (
            isAgentTool && subagent
              ? (
                <AgentResultSection
                  toolName={name}
                  text={result.content}
                  isError={!!result.isError}
                />
              )
              : (
                <ResultBlock
                  toolName={name}
                  text={result.content}
                  isError={!!result.isError}
                />
              )
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

function pickTaskPreview(input: unknown, fallback?: string): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const agent = typeof o.agent === 'string'
      ? o.agent
      : (typeof o.subagent_type === 'string' ? o.subagent_type : '');
    const task = typeof o.task === 'string'
      ? o.task
      : (typeof o.description === 'string' ? o.description : '');
    const text = [agent, task].filter(Boolean).join(': ');
    if (text.trim()) return text;
  }
  return fallback ?? '';
}

function TaskInputSection({
  input,
  partialInputJson,
  summary,
}: {
  input?: unknown;
  partialInputJson?: string;
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const preview = pickTaskPreview(input, summary);
  const inputText = formatInput(input, partialInputJson);

  return (
    <div className="rounded-md border border-border/70 bg-app/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-elevated"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <span className="shrink-0 font-medium text-fg">Task / Input</span>
        {!open && preview && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-subtle">
              {preview}
            </span>
          </>
        )}
      </button>
      {open && (
        <div className="border-t border-border/60 px-2 py-2">
          {input !== undefined && input !== null
            ? <InputView input={input} />
            : (inputText ? <CodeFrame label="Input" text={inputText} /> : <div className="text-xs text-fg-subtle">No input payload.</div>)}
        </div>
      )}
    </div>
  );
}

function subagentPhaseLabel(phase?: SubagentTranscript['phase']): string {
  switch (phase) {
    case 'spawning': return 'Spawning';
    case 'running': return 'Running';
    case 'finalizing': return 'Finalizing';
    case 'done': return 'Done';
    case 'error': return 'Failed';
    default: return 'Running';
  }
}

function SubagentSummaryLine({ subagent }: { subagent: SubagentTranscript }) {
  const elapsedMs = Math.max(0, subagent.updatedAt - subagent.startedAt);
  const tools = subagent.parts.filter((p) => p.kind === 'tool').length;
  const errors = subagent.parts.filter((p) => p.kind === 'tool' && (p.status === 'error' || p.result?.isError)).length;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-app/20 px-2 py-1 text-xs">
      <span className="font-medium text-fg">{subagent.agentName ?? subagent.agentSlug}</span>
      <span className="text-fg-subtle">· {subagentPhaseLabel(subagent.phase)}</span>
      <span className="text-fg-subtle">· tools {tools}</span>
      <span className={cn('text-fg-subtle', errors > 0 && 'text-red-300')}>· errors {errors}</span>
      <span className="ml-auto tabular-nums text-fg-subtle">{Math.floor(elapsedMs / 1000)}s</span>
    </div>
  );
}

function SubagentTranscriptView({ subagent }: { subagent: SubagentTranscript }) {
  return (
    <div className="space-y-2 border-l border-border/60 pl-2">
      {subagent.parts.length === 0 ? (
        <div className="text-xs text-fg-subtle">No events yet.</div>
      ) : (
        subagent.parts.map((part, i) => {
          const key = part.kind === 'tool' ? `${part.toolUseId}-${i}` : `${part.kind}-${i}`;
          if (part.kind === 'text') {
            return (
              <div key={key} className="rounded bg-panel px-2 py-1 text-sm text-fg">
                <Markdown text={part.text} />
              </div>
            );
          }
          if (part.kind === 'thinking') {
            return <ThinkingPart key={key} text={part.text} />;
          }
          return (
            <ToolPart
              key={key}
              name={part.name}
              input={part.input}
              partialInputJson={part.partialInputJson}
              result={part.result}
              status={part.status}
              subagent={part.subagent}
            />
          );
        })
      )}
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

function resultPreviewLine(text: string): string {
  const normalized = normalizeResult(text)
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized.length > 220 ? `${normalized.slice(0, 219)}…` : normalized;
}

function AgentResultSection({
  toolName,
  text,
  isError,
}: {
  toolName: string;
  text: string;
  isError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const preview = resultPreviewLine(text);

  return (
    <div className="rounded-md border border-border/70 bg-app/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-elevated"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <span className="shrink-0 font-medium text-fg">{isError ? 'Error' : 'Result'}</span>
        {!open && preview && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate text-fg-subtle">
              {preview}
            </span>
          </>
        )}
      </button>
      {open && (
        <div className="border-t border-border/60 px-2 py-2">
          <ResultBlock toolName={toolName} text={text} isError={isError} />
        </div>
      )}
    </div>
  );
}

function ResultBlock({
  toolName,
  text,
  isError,
}: {
  toolName: string;
  text: string;
  isError: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const display = normalizeResult(text);
  const truncated = display.length > RESULT_PREVIEW_LIMIT;
  const view = truncated ? display.slice(0, RESULT_PREVIEW_LIMIT) : display;
  const renderAsMarkdown =
    !isError && MARKDOWN_RESULT_TOOLS.has(toolName.toLowerCase());

  return (
    <>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-fg-subtle">
          <span>{isError ? 'Error' : 'Result'}</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Open in modal"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-fg-subtle hover:bg-elevated hover:text-fg"
          >
            <Maximize2 className="h-3 w-3" strokeWidth={1.75} />
            Expand
          </button>
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
        {truncated && (
          <button
            type="button"
            className="mt-1 text-xs text-fg-muted hover:text-fg"
            onClick={() => setExpanded(true)}
          >
            {`Show all (${display.length.toLocaleString()} chars)`}
          </button>
        )}
      </div>

      {expanded && (
        <ExpandModal
          title={isError ? 'Error' : 'Result'}
          onClose={() => setExpanded(false)}
        >
          <div className="scroll-thin flex-1 overflow-auto p-4">
            {renderAsMarkdown ? (
              <div className="text-sm leading-relaxed text-fg">
                <Markdown text={display} />
              </div>
            ) : (
              <pre
                className={cn(
                  'whitespace-pre-wrap break-words font-mono text-xs leading-relaxed',
                  isError ? 'text-red-300' : 'text-fg',
                )}
              >
                {display}
              </pre>
            )}
          </div>
        </ExpandModal>
      )}
    </>
  );
}
