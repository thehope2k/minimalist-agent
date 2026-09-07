// Shared split-view diff modal — used by both DiffPart and TurnSummaryCard.

import { lazy, Suspense } from 'react';
import { FilePenLine, FileText } from 'lucide-react';
import { CopyButton, ExpandModal } from '@/components/ui';
import { useCwd } from '@/contexts/CwdContext';
import { WrittenView } from './WrittenView';
import { type ParsedDiff, DIFF_METHOD_WORDS, diffViewerStyles, shortenPath } from './diff-utils';

// Lazy-loaded so react-diff-viewer-continued (~2.7 MB) stays out of the
// initial bundle. The viewer is only rendered when the user expands a diff
// chip or opens the split-view modal, so the deferred load is invisible.
export const LazyDiffViewer = lazy(() =>
  import('react-diff-viewer-continued').then((m) => ({ default: m.default }))
);

export function DiffExpandModal({
  parsed,
  name,
  onClose,
}: {
  parsed: ParsedDiff;
  name: string;
  onClose: () => void;
}) {
  const isWrite = name.toLowerCase() === 'write';
  const Icon = isWrite ? FileText : FilePenLine;
  const cwd = useCwd();

  const title = (
    <>
      <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} />
      <span className="text-sm font-medium text-fg">{name}</span>
      <span className="text-fg-subtle">·</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
        {shortenPath(parsed.filePath, cwd)}
      </span>
      <CopyButton text={parsed.newValue} className="shrink-0 opacity-100" />
    </>
  );

  return (
    <ExpandModal title={title} onClose={onClose} className="max-w-6xl">
      <div className="flex min-h-0 flex-1 flex-col bg-panel">
        {isWrite ? (
          <WrittenView filePath={parsed.filePath} content={parsed.newValue} embedded={true} />
        ) : (
          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<div className="h-16 animate-pulse rounded bg-elevated/40 m-4" />}>
              <LazyDiffViewer
                oldValue={parsed.oldValue}
                newValue={parsed.newValue}
                splitView={true}
                compareMethod={DIFF_METHOD_WORDS}
                useDarkTheme={true}
                styles={diffViewerStyles}
              />
            </Suspense>
          </div>
        )}
      </div>
    </ExpandModal>
  );
}
