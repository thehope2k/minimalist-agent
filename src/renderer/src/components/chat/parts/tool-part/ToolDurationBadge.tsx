import { Tooltip } from '@/components/ui';
import { formatToolDuration, shouldShowToolDuration } from './duration';

interface Props {
  durationMs?: number;
  status: 'running' | 'done' | 'error';
}

export function ToolDurationBadge({ durationMs, status }: Props) {
  if (!shouldShowToolDuration(durationMs, status)) return null;

  return (
    <Tooltip
      content={`Tool ran for ${durationMs.toLocaleString()} ms (time spent waiting for approval is excluded)`}
    >
      <span className="shrink-0 cursor-help font-mono text-[10px] tabular-nums text-fg-subtle">
        {formatToolDuration(durationMs)}
      </span>
    </Tooltip>
  );
}
