import { useState } from 'react';
import { ChevronRight, Scissors, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';
import { compactNumber } from './utils';
import { CopyButton, ExpandModal } from '@/components/ui';
import { Markdown } from '../parts/markdown/Markdown';

export function CompactionDivider({ message }: { message: ChatMessage }) {
  const meta = message.compactionMeta;
  const [open, setOpen] = useState(false);

  if (meta?.status === 'failed') {
    return <FailedCompactionDivider errorMessage={meta.errorMessage} trigger={meta.trigger} />;
  }

  const preTokens = meta?.preTokens;
  const saved =
    preTokens != null && preTokens > 0
      ? Math.max(0, preTokens - (meta?.postTokens ?? 0))
      : 0;
  const trigger = meta?.trigger ?? 'auto';
  const hasDetails = Boolean(meta?.summary || meta?.readFiles?.length || meta?.modifiedFiles?.length);
  const modifiedFiles = meta?.modifiedFiles ?? [];
  const readFiles = meta?.readFiles ?? [];

  return (
    <div className="my-2">
      <div
        role="separator"
        aria-label="Conversation compacted"
        className="flex items-center gap-3 text-fg-subtle"
        title={
          meta
            ? `Trigger: ${trigger}\nBefore: ${(preTokens ?? 0).toLocaleString()} tokens\nAfter: ${(meta.postTokens ?? 0).toLocaleString()} tokens`
            : undefined
        }
      >
        <div className="h-px flex-1 border-t border-dashed border-amber-500/30" />
        <button
          type="button"
          disabled={!hasDetails}
          onClick={() => hasDetails && setOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-300',
            hasDetails && 'hover:bg-amber-500/20 cursor-pointer',
          )}
        >
          {hasDetails && (
            <ChevronRight
              className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
              strokeWidth={2}
            />
          )}
          <Scissors className="h-3 w-3" strokeWidth={2} />
          <span>Compacted</span>
          {saved > 0 && (
            <span className="font-mono text-[10px] normal-case opacity-80">
              saved {compactNumber(saved)} tokens
            </span>
          )}
          {trigger === 'manual' && (
            <span className="rounded bg-amber-500/20 px-1 text-[9px] normal-case">manual</span>
          )}
          {trigger === 'overflow' && (
            <span className="rounded bg-amber-500/20 px-1 text-[9px] normal-case">overflow recovery</span>
          )}
        </button>
        <div className="h-px flex-1 border-t border-dashed border-amber-500/30" />
      </div>

      {open && hasDetails && (
        <ExpandModal title="Compaction Summary" onClose={() => setOpen(false)}>
          <div className="group flex items-center justify-end gap-1 border-b border-border/60 px-2 py-1">
            <CopyButton text={meta?.summary ?? ''} />
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 py-3 text-sm">
            {/* pi appends its own <read-files>/<modified-files> tags to the
                summary text; allowRawHtml=false keeps them from being parsed
                as HTML and garbled — we render that data separately below
                from the structured meta.readFiles/modifiedFiles instead. */}
            {meta?.summary && <Markdown text={meta.summary} allowRawHtml={false} />}
            {(modifiedFiles.length > 0 || readFiles.length > 0) && (
              <div className="mt-4 flex flex-col gap-1 border-t border-border/60 pt-3 text-xs text-fg-muted">
                {modifiedFiles.length > 0 && (
                  <div>
                    <span className="font-medium text-fg-subtle">Modified: </span>
                    <span className="font-mono">{modifiedFiles.join(', ')}</span>
                  </div>
                )}
                {readFiles.length > 0 && (
                  <div>
                    <span className="font-medium text-fg-subtle">Read: </span>
                    <span className="font-mono">{readFiles.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </ExpandModal>
      )}
    </div>
  );
}

function FailedCompactionDivider({
  errorMessage,
  trigger,
}: {
  errorMessage?: string;
  trigger?: string;
}) {
  return (
    <div
      role="separator"
      aria-label="Compaction failed"
      className="my-2 flex items-center gap-3 text-fg-subtle"
      title={errorMessage}
    >
      <div className="h-px flex-1 border-t border-dashed border-red-500/30" />
      <div className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-red-400">
        <TriangleAlert className="h-3 w-3" strokeWidth={2} />
        <span>Compaction failed</span>
        {trigger === 'overflow' && (
          <span className="rounded bg-red-500/20 px-1 text-[9px] normal-case">overflow recovery</span>
        )}
      </div>
      <div className="h-px flex-1 border-t border-dashed border-red-500/30" />
    </div>
  );
}
