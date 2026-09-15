import { useMemo } from 'react';
import type { ChatMessage } from '@/lib/chat';
import type { Plan } from '@/lib/electron';
import { AssistantCard } from '../../AssistantCard';
import { PlanProgress } from '../../PlanProgress';
import { StreamStatus } from '../../StreamStatus';
import { ToolPack } from '../../parts/ToolPack';
import { TurnSummaryCard } from '../../parts/TurnSummaryCard';
import { PartView } from '../PartView';
import { groupMessageParts } from '../group-parts';
import { emptyTurnLabel } from '../utils';

export function AssistantMessage({
  message,
  sessionId,
  plan,
}: {
  message: ChatMessage;
  sessionId?: string;
  plan?: Plan | null;
}) {
  const blocks = useMemo(() => groupMessageParts(message.parts), [message.parts]);
  const hasContent = message.parts.length > 0 || message.isStreaming;

  if (hasContent) {
    return (
      <AssistantCard>
        {blocks.map((block, index) => {
          if (block.kind === 'text' || block.kind === 'single') {
            return <PartView key={block.key} part={block.part} />;
          }
          return (
            <ToolPack
              key={block.key}
              parts={block.parts}
              isLive={!!message.isStreaming && index === blocks.length - 1}
            />
          );
        })}
        {!message.isStreaming && <TurnSummaryCard parts={message.parts} />}
        {message.isStreaming && (
          <StreamStatus parts={message.parts} startedAt={message.createdAt} />
        )}
        {plan && sessionId && (
          <div className="mt-3 border-t border-border/30 pt-3">
            <PlanProgress sessionId={sessionId} plan={plan} />
          </div>
        )}
      </AssistantCard>
    );
  }

  if (
    !message.errorInfo &&
    !message.error &&
    message.stopReason &&
    message.stopReason !== 'end_turn'
  ) {
    return (
      <AssistantCard>
        <p className="text-sm text-fg-muted italic">{emptyTurnLabel(message.stopReason)}</p>
      </AssistantCard>
    );
  }

  return null;
}
