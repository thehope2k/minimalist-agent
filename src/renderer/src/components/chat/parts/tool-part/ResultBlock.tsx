import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '../markdown/Markdown';
import { ExpandModal } from '@/components/ui';
import { normalizeResult } from './tool-helpers';
import { RESULT_PREVIEW_LIMIT, MARKDOWN_RESULT_TOOLS } from './types';

type Props = {
  toolName: string;
  text: string;
  isError: boolean;
};

export function ResultBlock({ toolName, text, isError }: Props) {
  const [expanded, setExpanded] = useState(false);
  const display = normalizeResult(text);
  const truncated = display.length > RESULT_PREVIEW_LIMIT;
  const view = truncated ? display.slice(0, RESULT_PREVIEW_LIMIT) : display;
  const renderAsMarkdown =
    !isError && MARKDOWN_RESULT_TOOLS.has(toolName.toLowerCase());

  return (
    <>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-fg-subtle">
          <span>{isError ? 'Error' : 'Result'}</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Open in modal"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-fg-subtle hover:bg-elevated hover:text-fg"
          >
            <Maximize2 className="h-3 w-3" strokeWidth={1.75} />
            Expand
          </button>
        </div>
        {renderAsMarkdown ? (
          <div className="rounded bg-panel px-2 py-1.5 text-sm leading-relaxed text-fg">
            <Markdown text={view + (truncated ? '\n\n…' : '')} />
          </div>
        ) : (
          <pre
            className={cn(
              'scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed',
              isError ? 'text-red-300' : 'text-fg',
            )}
          >
            {view}
            {truncated && '\n…'}
          </pre>
        )}
        {truncated && (
          <button
            type="button"
            className="mt-1 text-xs text-fg-muted hover:text-fg"
            onClick={() => setExpanded(true)}
          >
            {`Show all (${display.length.toLocaleString()} chars)`}
          </button>
        )}
      </div>

      {expanded && (
        <ExpandModal
          title={isError ? 'Error' : 'Result'}
          onClose={() => setExpanded(false)}
        >
          <div className="scroll-thin flex-1 overflow-auto p-4">
            {renderAsMarkdown ? (
              <div className="text-sm leading-relaxed text-fg">
                <Markdown text={display} />
              </div>
            ) : (
              <pre
                className={cn(
                  'whitespace-pre-wrap break-words font-mono text-xs leading-relaxed',
                  isError ? 'text-red-300' : 'text-fg',
                )}
              >
                {display}
              </pre>
            )}
          </div>
        </ExpandModal>
      )}
    </>
  );
}
