import { ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';
import { Button } from '../../../ui';
import { ShareResponseButton } from '../ShareResponseButton';
import { compactNumber } from '../utils';

export function AssistantMessageFooter({
  message,
  onContinue,
  sessionId,
}: {
  message: ChatMessage;
  onContinue?: () => void;
  sessionId?: string;
}) {
  if (message.isStreaming) return null;

  const showStopBadge = !!message.stopReason && message.stopReason !== 'end_turn';
  const canContinue =
    message.stopReason === 'max_turns' || message.errorInfo?.code === 'max_turns_exceeded';
  const hasMetadata =
    message.model ||
    message.usage?.outputTokens !== undefined ||
    message.stopReason ||
    message.durationMs !== undefined;

  return (
    <div className="mt-1 flex w-full items-center justify-between">
      <div className="flex items-center gap-1.5">
        {showStopBadge && (
          <span className="rounded-sm bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-300">
            {message.stopReason}
          </span>
        )}
        {canContinue && onContinue && (
          <Button
            variant="outline"
            size="sm"
            icon={ChevronsRight}
            onClick={onContinue}
            className="h-5 border-accent/40 bg-accent/10 px-1.5 text-[10px] text-accent hover:bg-accent/20 hover:text-accent"
          >
            Continue
          </Button>
        )}
        {hasMetadata && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-panel/40',
              'px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle',
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
            )}
          >
            {message.model && <span className="text-fg-muted">{message.model}</span>}
            {message.model && message.usage?.outputTokens !== undefined && (
              <span className="opacity-50">·</span>
            )}
            {message.usage?.outputTokens !== undefined && (
              <span title="input ↑ / output ↓ tokens">
                {compactNumber(message.usage.inputTokens ?? 0)}↑{' '}
                {compactNumber(message.usage.outputTokens)}↓
              </span>
            )}
            {message.stopReason && !showStopBadge && (
              <>
                <span className="opacity-50">·</span>
                <span title="SDK stop_reason">{message.stopReason}</span>
              </>
            )}
            {message.durationMs !== undefined && (
              <>
                <span className="opacity-50">·</span>
                <span title="Turn duration">{formatDuration(message.durationMs)}</span>
              </>
            )}
          </span>
        )}
      </div>
      <ShareResponseButton parts={message.parts} sessionId={sessionId} />
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;
}
