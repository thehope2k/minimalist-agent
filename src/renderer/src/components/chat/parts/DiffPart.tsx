// Custom renderer for the `Edit` and `Write` built-in tools. Instead of
// dumping raw JSON like other tool chips, we produce a code diff so the
// user can immediately see what the agent changed.
//
// Inline view = unified (single column) — fits any width and matches the
// minimalist chip style. The "Open" button pops a modal with split view
// for big edits where side-by-side comparison is worth the space.
//
// Edit input:  { file_path, old_string, new_string, replace_all? }
// Write input: { file_path, content }   (treated as full-file addition)

import { useMemo, useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FilePenLine,
  FileText,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseDiffInput,
  countDiffLines,
  shortenPath,
  stripErrorWrapper,
  diffViewerStyles,
  DiffExpandModal,
} from './diff-utils';

interface DiffPartProps {
  name: string;
  input?: unknown;
  result?: { content: string; isError?: boolean };
  status: 'running' | 'done' | 'error';
}

export function DiffPart({ name, input, result, status }: DiffPartProps) {
  // Backend-agnostic: Anthropic emits 'Write'/'Edit', Pi emits 'write'/'edit'.
  const isWrite = name.toLowerCase() === 'write';
  const erroredOrFailed = status === 'error' || result?.isError;
  // Diff chips stay collapsed by default — even on error. The red border +
  // alert icon already flag failure, and a failed edit didn't actually
  // change the file, so showing the would-be diff is just noise.
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const parsed = useMemo(() => parseDiffInput(name, input), [name, input]);
  const stats = useMemo(
    () => (parsed ? countDiffLines(parsed.oldValue, parsed.newValue) : null),
    [parsed],
  );

  // Couldn't extract a usable diff — usually because input is still
  // streaming (file_path not yet present). Render a status-aware placeholder
  // so we don't crash the bubble *and* don't lie about the work being done.
  if (!parsed) {
    const isRunning = status === 'running';
    const Icon = isRunning ? Loader2 : isWrite ? FileText : FilePenLine;
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-2.5 py-1.5 text-xs text-fg-subtle">
        <Icon
          className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')}
          strokeWidth={1.75}
        />
        <span>{isWrite ? 'Writing file…' : 'Editing file…'}</span>
      </div>
    );
  }

  const Icon = isWrite ? FileText : FilePenLine;
  const shortPath = shortenPath(parsed.filePath);

  return (
    <>
      <div
        className={cn(
          'overflow-hidden rounded-md border text-xs transition-colors',
          // Visual weight comes from the +/- pill badges — the chip itself
          // stays neutral so it lives in the same family as Bash/Read.
          erroredOrFailed
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-border bg-elevated/40',
        )}
      >
        <div
          className={cn(
            'flex w-full items-center gap-2 px-2.5 py-1.5',
            'hover:bg-elevated/40',
          )}
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 shrink-0 text-fg-subtle transition-transform',
                open && 'rotate-90',
              )}
              strokeWidth={2}
            />
            <Icon
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                erroredOrFailed ? 'text-red-400' : 'text-accent',
              )}
              strokeWidth={1.75}
            />
            <span
              className={cn(
                'shrink-0 font-medium',
                erroredOrFailed ? 'text-red-300' : 'text-fg',
              )}
            >
              {isWrite ? 'Write' : 'Edit'}
            </span>
            {stats && (stats.additions > 0 || stats.deletions > 0) && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
                {stats.deletions > 0 && (
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-medium text-red-400">
                    -{stats.deletions}
                  </span>
                )}
                {stats.additions > 0 && (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-400">
                    +{stats.additions}
                  </span>
                )}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate rounded bg-panel/60 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {shortPath}
            </span>
          </button>
          <span className="flex shrink-0 items-center gap-1.5 text-fg-muted">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Open diff in modal"
              title="Open diff in modal (split view)"
              className="rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:outline-none"
            >
              <Maximize2 className="h-3 w-3" strokeWidth={2} />
            </button>
            <StatusIcon status={status} resultIsError={result?.isError} />
          </span>
        </div>
        {erroredOrFailed && !open && result?.content && (
          <div className="border-t border-red-500/20 px-3 py-1.5">
            <span className="line-clamp-2 wrap-break-word font-mono text-[11px] text-red-300">
              {stripErrorWrapper(result.content)}
            </span>
          </div>
        )}
        {open && (
          <div className="border-t border-border/60">
            <div className="scroll-thin overflow-x-auto bg-panel">
              <ReactDiffViewer
                oldValue={parsed.oldValue}
                newValue={parsed.newValue}
                splitView={false}
                compareMethod={DiffMethod.WORDS}
                useDarkTheme={true}
                styles={diffViewerStyles}
              />
            </div>
            {result?.isError && (
              <div className="border-t border-border/60 px-3 py-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-fg-subtle">
                  Error
                </div>
                <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap wrap-break-word rounded bg-panel px-2 py-1.5 font-mono text-[11px] leading-relaxed text-red-300">
                  {result.content}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
      {modalOpen && (
        <DiffExpandModal
          parsed={parsed}
          name={name}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
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


