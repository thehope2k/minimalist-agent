import { useState } from 'react';
import { ChevronRight, Scissors, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';
import { compactNumber } from './utils';

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
        <div className="mx-auto mt-2 max-w-2xl rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-fg-muted">
          {meta?.summary && (
            <div className="whitespace-pre-wrap leading-relaxed">{meta.summary}</div>
          )}
          {(meta?.readFiles?.length || meta?.modifiedFiles?.length) ? (
            <div className="mt-2 flex flex-col gap-1 border-t border-amber-500/20 pt-2">
              {meta?.modifiedFiles && meta.modifiedFiles.length > 0 && (
                <div>
                  <span className="font-medium text-fg-subtle">Modified: </span>
                  <span className="font-mono">{meta.modifiedFiles.join(', ')}</span>
                </div>
              )}
              {meta?.readFiles && meta.readFiles.length > 0 && (
                <div>
                  <span className="font-medium text-fg-subtle">Read: </span>
                  <span className="font-mono">{meta.readFiles.join(', ')}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
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
