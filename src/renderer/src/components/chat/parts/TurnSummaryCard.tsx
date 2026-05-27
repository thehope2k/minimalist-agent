// End-of-turn aggregate diff card.
//
// After a turn completes, collects every successful Edit/Write tool call,
// groups them by file path, and merges the patches into a single net diff
// per file. The card is collapsed by default showing "N files changed",
// and expands to let the user browse the per-file unified diffs.
//
// This is purely session/tool-call data — no git, works in non-git dirs.

import { useMemo, useState, Suspense } from 'react';
import { ChevronRight, FilePenLine, FileText, GitCommit, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessagePart } from '@/lib/chat';
import {
  type ParsedDiff,
  parseDiffInput,
  countDiffLines,
  shortenPath,
  diffViewerStyles,
  DiffExpandModal,
  LazyDiffViewer,
  DIFF_METHOD_WORDS,
  WrittenView,
  EDIT_SEP,
} from './diff-utils';

interface FileSummary {
  filePath: string;
  /** 'write' if the last op was a Write; 'edit' otherwise. */
  lastOpKind: 'edit' | 'write';
  /** Net merged diff (old = pre-turn state, new = post-turn state). */
  merged: ParsedDiff;
  stats: { additions: number; deletions: number };
  /** How many tool calls touched this file — shown as a subtle hint. */
  opCount: number;
}

// ─── data derivation ────────────────────────────────────────────────────────

function collectFileSummaries(parts: MessagePart[]): FileSummary[] {
  // Gather every successful Edit/Write, preserving order.
  const raw: Array<{ filePath: string; parsed: ParsedDiff; opKind: 'edit' | 'write' }> = [];
  for (const p of parts) {
    if (p.kind !== 'tool') continue;
    const lower = p.name.toLowerCase();
    if (lower !== 'edit' && lower !== 'write') continue;
    if (p.status !== 'done' || p.result?.isError) continue;
    const parsed = parseDiffInput(p.name, p.input);
    if (!parsed) continue;
    raw.push({ filePath: parsed.filePath, parsed, opKind: lower as 'edit' | 'write' });
  }

  if (raw.length === 0) return [];

  // Group by file path, preserving first-seen insertion order.
  const order: string[] = [];
  const groups = new Map<
    string,
    Array<{ parsed: ParsedDiff; opKind: 'edit' | 'write' }>
  >();
  for (const entry of raw) {
    if (!groups.has(entry.filePath)) {
      order.push(entry.filePath);
      groups.set(entry.filePath, []);
    }
    groups.get(entry.filePath)!.push({ parsed: entry.parsed, opKind: entry.opKind });
  }

  return order.map((fp) => {
    const ops = groups.get(fp)!;
    const merged = mergeOps(ops);
    return {
      filePath: fp,
      lastOpKind: ops[ops.length - 1].opKind,
      merged,
      stats: countDiffLines(merged.oldValue, merged.newValue),
      opCount: ops.length,
    };
  });
}

function mergeOps(
  ops: Array<{ parsed: ParsedDiff; opKind: 'edit' | 'write' }>,
): ParsedDiff {
  const { filePath } = ops[0].parsed;

  // If the last op is a Write it defines the authoritative final state.
  // oldValue is '' because we don't have the pre-turn snapshot — the diff
  // reads as "this is what the file looks like after the turn".
  const lastOp = ops[ops.length - 1];
  if (lastOp.opKind === 'write') {
    return { filePath, oldValue: '', newValue: lastOp.parsed.newValue };
  }

  // All edits: fast-path for the common single-edit case.
  if (ops.length === 1) return ops[0].parsed;

  // Multiple edit patches: join with the separator so ReactDiffViewer shows
  // each hunk in context — same SEP the Pi edits[] parser already uses.
  return {
    filePath,
    oldValue: ops.map((o) => o.parsed.oldValue).join(EDIT_SEP),
    newValue: ops.map((o) => o.parsed.newValue).join(EDIT_SEP),
  };
}

// ─── component ──────────────────────────────────────────────────────────────

export function TurnSummaryCard({ parts }: { parts: MessagePart[] }) {
  const summaries = useMemo(() => collectFileSummaries(parts), [parts]);
  const [cardOpen, setCardOpen] = useState(false);
  const [openDiffs, setOpenDiffs] = useState<Set<string>>(new Set());
  const [modalFile, setModalFile] = useState<FileSummary | null>(null);

  if (summaries.length === 0) return null;

  const totalStats = summaries.reduce(
    (acc, s) => ({
      additions: acc.additions + s.stats.additions,
      deletions: acc.deletions + s.stats.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  function toggleDiff(fp: string) {
    setOpenDiffs((prev) => {
      const next = new Set(prev);
      next.has(fp) ? next.delete(fp) : next.add(fp);
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setCardOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded border border-border/30 bg-panel/30 px-2 py-0.5 text-xs hover:bg-elevated/40 transition-colors text-fg-muted hover:text-fg"
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 transition-transform',
            cardOpen && 'rotate-90',
          )}
          strokeWidth={2}
        />
        <GitCommit className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        <span className="whitespace-nowrap">
          {summaries.length} file{summaries.length !== 1 ? 's' : ''}
        </span>
        {totalStats.deletions > 0 && (
          <span className="whitespace-nowrap rounded bg-red-500/10 px-1 py-0.5 text-[10px] font-medium text-red-400 tabular-nums">
            −{totalStats.deletions}
          </span>
        )}
        {totalStats.additions > 0 && (
          <span className="whitespace-nowrap rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] font-medium text-emerald-400 tabular-nums">
            +{totalStats.additions}
          </span>
        )}
      </button>

      {/* Expanded view - modal or inline */}
      {cardOpen && (
        <div className="mt-2 overflow-hidden rounded-md border border-border/40 text-xs">
          <div className="border-t border-border/60">
            {summaries.map((s, i) => (
              <FileRow
                key={s.filePath}
                summary={s}
                diffOpen={openDiffs.has(s.filePath)}
                onToggleDiff={() => toggleDiff(s.filePath)}
                onOpenModal={() => setModalFile(s)}
                isLast={i === summaries.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {modalFile && (
        <DiffExpandModal
          parsed={modalFile.merged}
          name={modalFile.lastOpKind === 'write' ? 'Write' : 'Edit'}
          onClose={() => setModalFile(null)}
        />
      )}
    </>
  );
}

// ─── per-file row ────────────────────────────────────────────────────────────

function FileRow({
  summary,
  diffOpen,
  onToggleDiff,
  onOpenModal,
  isLast,
}: {
  summary: FileSummary;
  diffOpen: boolean;
  onToggleDiff: () => void;
  onOpenModal: () => void;
  isLast: boolean;
}) {
  const { merged, stats, lastOpKind, opCount } = summary;
  const Icon = lastOpKind === 'write' ? FileText : FilePenLine;
  const shortPath = shortenPath(merged.filePath);

  return (
    <div className={cn('border-border/40', !isLast && 'border-b')}>
      {/* row header */}
      <div className="flex w-full items-center gap-2 px-2.5 py-1.5 hover:bg-elevated/40">
        <button
          type="button"
          onClick={onToggleDiff}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
        >
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-fg-subtle transition-transform',
              diffOpen && 'rotate-90',
            )}
            strokeWidth={2}
          />
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
          <span className="shrink-0 font-medium text-fg">
            {lastOpKind === 'write' ? 'Write' : 'Edit'}
          </span>
          {/* +/- stats */}
          {(stats.deletions > 0 || stats.additions > 0) && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              {stats.deletions > 0 && (
                <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                  −{stats.deletions}
                </span>
              )}
              {stats.additions > 0 && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  +{stats.additions}
                </span>
              )}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate rounded bg-panel/60 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
            {shortPath}
          </span>
          {/* subtle "N ops merged" hint when we collapsed multiple tool calls */}
          {opCount > 1 && (
            <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[10px] text-fg-subtle">
              {opCount} ops
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenModal}
          aria-label="Open diff in modal"
          title="Open in split view"
          className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:outline-none"
        >
          <Maximize2 className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      {/* inline diff */}
      {diffOpen && (
        <div className="border-t border-border/60">
          {lastOpKind === 'write' ? (
            <WrittenView filePath={merged.filePath} content={merged.newValue} />
          ) : (
            <div className="scroll-thin overflow-x-auto bg-panel">
              <Suspense fallback={<div className="h-16 animate-pulse rounded bg-elevated/40 m-4" />}>
                <LazyDiffViewer
                  oldValue={merged.oldValue}
                  newValue={merged.newValue}
                  splitView={false}
                  compareMethod={DIFF_METHOD_WORDS}
                  useDarkTheme={true}
                  styles={diffViewerStyles}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
