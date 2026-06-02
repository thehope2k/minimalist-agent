import { cn } from '@/lib/utils';
import { Markdown } from '../markdown/Markdown';
import { ThinkingPart } from '../ThinkingPart';
import { subagentPhaseLabel } from './tool-helpers';
import type { SubagentTranscript } from '@/lib/chat';

type Props = {
  subagent: SubagentTranscript;
};

export function SubagentSummaryLine({ subagent }: Props) {
  const elapsedMs = Math.max(0, subagent.updatedAt - subagent.startedAt);
  const tools = subagent.parts.filter((p) => p.kind === 'tool').length;
  const errors = subagent.parts.filter(
    (p) => p.kind === 'tool' && (p.status === 'error' || p.result?.isError)
  ).length;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-app/20 px-2 py-1 text-xs">
      <span className="font-medium text-fg">
        {subagent.agentName ?? subagent.agentSlug}
      </span>
      <span className="text-fg-subtle">· {subagentPhaseLabel(subagent.phase)}</span>
      <span className="text-fg-subtle">· tools {tools}</span>
      <span className={cn('text-fg-subtle', errors > 0 && 'text-red-300')}>
        · errors {errors}
      </span>
      <span className="ml-auto tabular-nums text-fg-subtle">
        {Math.floor(elapsedMs / 1000)}s
      </span>
    </div>
  );
}

export function SubagentTranscriptView({ subagent }: Props) {
  // Avoid circular dependency - import ToolPart at runtime
  const ToolPart = require('../ToolPart').ToolPart;

  return (
    <div className="space-y-2 border-l border-border/60 pl-2">
      {subagent.parts.length === 0 ? (
        <div className="text-xs text-fg-subtle">No events yet.</div>
      ) : (
        subagent.parts.map((part, i) => {
          const key = part.kind === 'tool' ? `${part.toolUseId}-${i}` : `${part.kind}-${i}`;
          if (part.kind === 'text') {
            return (
              <div key={key} className="rounded bg-panel px-2 py-1 text-sm text-fg">
                <Markdown text={part.text} />
              </div>
            );
          }
          if (part.kind === 'thinking') {
            return <ThinkingPart key={key} text={part.text} />;
          }
          return (
            <ToolPart
              key={key}
              name={part.name}
              input={part.input}
              partialInputJson={part.partialInputJson}
              result={part.result}
              status={part.status}
              subagent={part.subagent}
            />
          );
        })
      )}
    </div>
  );
}
