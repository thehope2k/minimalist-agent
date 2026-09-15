import { GitCommitHorizontal, Loader2 } from 'lucide-react';
import { GitDiffView } from '../GitDiffView';
import type { GitFileDiff } from '../types';

interface AmendFilePreviewProps {
  diff: GitFileDiff | null;
  loading: boolean;
  splitView: boolean;
}

export function AmendFilePreview({ diff, loading, splitView }: AmendFilePreviewProps) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-elevated/40 px-3 py-1.5">
        <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <span className="text-[11px] font-medium text-fg-subtle">
          Read-only — already part of the commit being amended
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
          </div>
        ) : (
          <GitDiffView
            diff={diff}
            splitView={splitView}
            changes={[]}
            stagedHunks={undefined}
            onToggleHunk={() => {}}
            hunksInteractive={false}
          />
        )}
      </div>
    </>
  );
}
