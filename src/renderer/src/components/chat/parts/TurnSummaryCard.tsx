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
import { useCwd } from '@/contexts/CwdContext';
import type { MessagePart } from '@/lib/chat';
import { collectFileSummaries, type FileSummary } from './turn-summary';
import { shortenPath, diffViewerStyles, DIFF_METHOD_WORDS, } from './diff-utils';
import { DiffExpandModal, LazyDiffViewer } from './DiffExpandModal';
import { WrittenView } from './WrittenView';

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
  const cwd = useCwd();
  const shortPath = shortenPath(merged.filePath, cwd);

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
