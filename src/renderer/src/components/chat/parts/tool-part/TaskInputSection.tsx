import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InputView } from './InputView';
import { formatInput, pickTaskPreview } from './tool-helpers';

function CodeFrame({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
        {text}
      </pre>
    </div>
  );
}

type Props = {
  input?: unknown;
  partialInputJson?: string;
  summary?: string;
};

export function TaskInputSection({ input, partialInputJson, summary }: Props) {
  const [open, setOpen] = useState(false);
  const preview = pickTaskPreview(input, summary);
  const inputText = formatInput(input, partialInputJson);

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
        <span className="shrink-0 font-medium text-fg">Task / Input</span>
        {!open && preview && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-subtle">
              {preview}
            </span>
          </>
        )}
      </button>
      {open && (
        <div className="border-t border-border/60 px-2 py-2">
          {input !== undefined && input !== null
            ? <InputView input={input} />
            : (inputText ? <CodeFrame label="Input" text={inputText} /> : <div className="text-xs text-fg-subtle">No input payload.</div>)}
        </div>
      )}
    </div>
  );
}
