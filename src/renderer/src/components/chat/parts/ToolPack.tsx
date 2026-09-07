import { useState } from 'react';
import { AlertTriangle, Blocks, Bot, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PartView } from '../message-list/PartView';
import { partKey } from '../message-list/utils';
import { summarizePack } from './pack-summary';
import type { MessagePart } from '@/lib/chat';

interface ToolPackProps {
  parts: MessagePart[];
  /** True only for the trailing pack of a still-streaming turn. */
  isLive: boolean;
}

/**
 * Collapsed-by-default rollup for the thinking/tool-call work between two
 * of the model's own narration checkpoints (text parts). Open state tracks
 * `isLive` until the user manually toggles it, at which point their choice
 * wins from then on — so a pack opens automatically while it's the one
 * actively streaming, and settles closed on its own once superseded.
 */
export function ToolPack({ parts, isLive }: ToolPackProps) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? isLive;
  const { label, errorCount, hasSubagent } = summarizePack(parts);

  return (
    <div className="rounded-md border border-border/60 bg-elevated/30">
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-elevated/60"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <Blocks className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <span className="text-fg-subtle">{label}</span>
        {(hasSubagent || errorCount > 0) && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {hasSubagent && (
              <span className="flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                <Bot className="h-3 w-3" strokeWidth={2} />
                subagent
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                {errorCount === 1 ? '1 error' : `${errorCount} errors`}
              </span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 p-2">
          {parts.map((part, i) => (
            <PartView key={partKey(part.kind, part.kind === 'tool' ? part.toolUseId : undefined, i)} part={part} />
          ))}
        </div>
      )}
    </div>
  );
}
