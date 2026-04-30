import { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown/Markdown';

export function ThinkingPart({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-elevated/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-elevated"
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
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-xs italic text-fg-subtle">
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}
