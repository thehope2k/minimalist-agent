import { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown/Markdown';
import { RoundOutputBadge } from './RoundOutputBadge';
import { useChipChrome } from './chip-chrome';

export function ThinkingPart({ text, outputTokens }: { text: string; outputTokens?: number }) {
  const [open, setOpen] = useState(false);
  const chrome = useChipChrome();
  return (
    <div className={chrome}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-elevated"
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <Brain className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        <span className="shrink-0 font-medium text-fg">Thinking</span>
        {!open && text.trim() && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate text-fg-subtle">
              {text.slice(0, 200).trim()}
              {text.length > 200 ? '…' : ''}
            </span>
          </>
        )}
        <span className="ml-auto shrink-0">
          <RoundOutputBadge outputTokens={outputTokens} />
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-sm italic text-fg-subtle">
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}
