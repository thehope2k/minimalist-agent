import { compactNumber } from '../message-list/utils';
import { Tooltip } from '@/components/ui';

/**
 * Distinct from ContextDeltaBadge's amber "growth" styling — this is
 * generation cost (the model's own output for the round), not context
 * added by a tool result. Different color so the two aren't conflated.
 */
export function RoundOutputBadge({ outputTokens }: { outputTokens?: number }) {
  if (!outputTokens) return null;

  return (
    <Tooltip content={`${outputTokens.toLocaleString()} tokens generated this round`}>
      <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
        {compactNumber(outputTokens)}
      </span>
    </Tooltip>
  );
}
