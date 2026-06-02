import { CompactionNotice } from '../CompactionNotice';
import { MOD as SHORTCUT_MOD_SYMBOL } from '@/lib/shortcuts';
import type { CompactionNotice as CompactionNoticeT } from '@/hooks/useChat';

type Props = {
  lastCompaction: CompactionNoticeT | null;
  isStreaming: boolean;
};

export function StatusFooter({ lastCompaction, isStreaming }: Props) {
  return (
    <div className="mx-auto w-full max-w-240">
      <CompactionNotice notice={lastCompaction} />
      
      {isStreaming && (
        <div className="mb-2 flex items-center justify-end gap-1.5 px-1 text-[10px] text-fg-subtle">
          <span>Send paused while running ·</span>
          <kbd className="rounded border border-border bg-elevated/60 px-1 py-px font-mono text-[10px] leading-none text-fg-muted">
            {SHORTCUT_MOD_SYMBOL}
          </kbd>
          <kbd className="rounded border border-border bg-elevated/60 px-1 py-px font-mono text-[10px] leading-none text-fg-muted">
            ⏎
          </kbd>
          <span>to inject this message into the turn</span>
        </div>
      )}
    </div>
  );
}
