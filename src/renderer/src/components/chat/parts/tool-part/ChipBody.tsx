import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/ui';
import {
  canonicalToolName,
  iconForTool,
  summarizeToolCall,
  summarizeToolResult,
} from '@/lib/tool-summary';
import { InputView } from './InputView';
import { TaskInputSection } from './TaskInputSection';
import { SubagentSummaryLine, SubagentTranscriptView } from './SubagentTranscript';
import { AgentResultSection } from './AgentResultSection';
import { ResultBlock } from './ResultBlock';
import { StatusIcon } from './StatusIcon';
import { formatInput } from './tool-helpers';
import type { ToolPartProps } from './types';

function CodeFrame({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-fg-subtle">
        <span>{label}</span>
        <CopyButton text={text} className="opacity-100" />
      </div>
      <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
        {text}
      </pre>
    </div>
  );
}

export function ChipBody({
  name,
  input,
  partialInputJson,
  result,
  status,
  subagent,
}: ToolPartProps) {
  const erroredOrFailed = status === 'error' || result?.isError;
  const [open, setOpen] = useState(erroredOrFailed);
  const inputText = formatInput(input, partialInputJson);
  const summary = summarizeToolCall(name, input);
  const resultSummary = summarizeToolResult(name, result);
  const ToolIcon = iconForTool(name);
  const isAgentTool = canonicalToolName(name) === 'Agent';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border text-xs transition-colors',
        erroredOrFailed
          ? 'border-red-500/30 bg-red-500/5'
          : isAgentTool
            ? 'border-accent/40 bg-elevated/40'
            : 'border-border bg-elevated/40',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left',
          isAgentTool
            ? 'bg-accent/10 hover:bg-accent/15 focus-visible:bg-accent/15'
            : 'hover:bg-elevated focus-visible:bg-elevated',
          'focus-visible:outline-none',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-90',
          )}
          strokeWidth={2}
        />
        <ToolIcon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            erroredOrFailed ? 'text-red-400' : 'text-fg-muted',
          )}
          strokeWidth={1.75}
        />
        <span
          className={cn(
            'shrink-0 font-medium',
            erroredOrFailed ? 'text-red-300' : 'text-fg',
          )}
        >
          {canonicalToolName(name)}
        </span>
        {summary && (
          <>
            <span className="shrink-0 text-fg-subtle">·</span>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-subtle">
              {summary}
            </span>
          </>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-fg-muted">
          {resultSummary && !open && (
            <span className="text-xs text-fg-subtle">{resultSummary}</span>
          )}
          <StatusIcon status={status} resultIsError={result?.isError} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          {subagent && <SubagentSummaryLine subagent={subagent} />}
          {isAgentTool ? (
            <TaskInputSection
              input={input}
              partialInputJson={partialInputJson}
              summary={summary}
            />
          ) : input !== undefined && input !== null ? (
            <InputView input={input} />
          ) : (
            inputText && <CodeFrame label="Input" text={inputText} />
          )}
          {subagent && <SubagentTranscriptView subagent={subagent} />}
          {result && (
            isAgentTool && subagent
              ? (
                <AgentResultSection
                  toolName={name}
                  text={result.content}
                  isError={!!result.isError}
                />
              )
              : (
                <ResultBlock
                  toolName={name}
                  text={result.content}
                  isError={!!result.isError}
                />
              )
          )}
        </div>
      )}
    </div>
  );
}
