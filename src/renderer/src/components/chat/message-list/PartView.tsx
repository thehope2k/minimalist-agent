import { ThinkingPart } from '../parts/ThinkingPart';
import { ToolPart } from '../parts/ToolPart';
import { TextPart } from '../parts/TextPart';
import type { MessagePart } from '@/lib/chat';

export function PartView({ part }: { part: MessagePart }) {
  switch (part.kind) {
    case 'text':     return <TextPart text={part.text} />;
    case 'thinking': return <ThinkingPart text={part.text} outputTokens={part.outputTokens} />;
    case 'tool':
      return (
        <ToolPart
          name={part.name}
          input={part.input}
          partialInputJson={part.partialInputJson}
          result={part.result}
          status={part.status}
          subagent={part.subagent}
          contextDelta={part.contextDelta}
          contextDeltaGroupSize={part.contextDeltaGroupSize}
        />
      );
    default: return null;
  }
}
