import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResultBlock } from './ResultBlock';
import { resultPreviewLine } from './tool-helpers';

type Props = {
  toolName: string;
  text: string;
  isError: boolean;
};

export function AgentResultSection({ toolName, text, isError }: Props) {
  const [open, setOpen] = useState(false);
  const preview = resultPreviewLine(text);

  return (
    <div className="rounded-md border border-border/70 bg-app/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-elevated"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <span className="shrink-0 font-medium text-fg">{isError ? 'Error' : 'Result'}</span>
        {!open && preview && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate text-fg-subtle">
              {preview}
            </span>
          </>
        )}
      </button>
      {open && (
        <div className="border-t border-border/60 px-2 py-2">
          <ResultBlock toolName={toolName} text={text} isError={isError} />
        </div>
      )}
    </div>
  );
}
