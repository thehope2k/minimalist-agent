import { compactNumber } from '../../message-list/utils';
import { Tooltip } from '@/components/ui';

interface Props {
  contextDelta?: number;
  contextDeltaGroupSize?: number;
}

/** Shared by ChipBody and DiffPart so both chip families render this consistently. */
export function ContextDeltaBadge({ contextDelta, contextDeltaGroupSize }: Props) {
  if (contextDelta == null || contextDelta <= 0) return null;

  const label = `+${compactNumber(contextDelta)}`;
  const tooltip =
    contextDeltaGroupSize && contextDeltaGroupSize > 1
      ? `${contextDelta.toLocaleString()} tokens added to context, shared across ${contextDeltaGroupSize} parallel tool calls`
      : `${contextDelta.toLocaleString()} tokens added to context by this tool call`;

  return (
    <Tooltip content={tooltip}>
      <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
        {label}
      </span>
    </Tooltip>
  );
}
