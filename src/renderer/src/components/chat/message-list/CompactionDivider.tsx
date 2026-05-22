import { Scissors } from 'lucide-react';
import type { ChatMessage } from '@/lib/chat';
import { compactNumber } from './utils';

export function CompactionDivider({ message }: { message: ChatMessage }) {
  const meta = message.compactionMeta;
  const saved =
    meta && meta.preTokens > 0
      ? Math.max(0, meta.preTokens - (meta.postTokens ?? 0))
      : 0;
  const trigger = meta?.trigger ?? 'auto';
  return (
    <div
      role="separator"
      aria-label="Conversation compacted"
      className="my-2 flex items-center gap-3 text-fg-subtle"
      title={
        meta
          ? `Trigger: ${trigger}\nBefore: ${meta.preTokens.toLocaleString()} tokens\nAfter: ${(meta.postTokens ?? 0).toLocaleString()} tokens`
          : undefined
      }
    >
      <div className="h-px flex-1 border-t border-dashed border-amber-500/30" />
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-300">
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
      </div>
      <div className="h-px flex-1 border-t border-dashed border-amber-500/30" />
    </div>
  );
}
