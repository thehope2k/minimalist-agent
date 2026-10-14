const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_TENTH_SECOND = 100;
const TENTHS_PER_SECOND = 10;
const FRACTIONAL_SECONDS_BELOW_MS = 10 * MS_PER_SECOND;

// Sub-second calls are noise in a tool-heavy turn.
export const MIN_VISIBLE_TOOL_DURATION_MS = MS_PER_SECOND;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function shouldShowToolDuration(
  durationMs: number | undefined,
  status: 'running' | 'done' | 'error',
): durationMs is number {
  return (
    status !== 'running' && durationMs !== undefined && durationMs >= MIN_VISIBLE_TOOL_DURATION_MS
  );
}

export function formatToolDuration(ms: number): string {
  if (ms < FRACTIONAL_SECONDS_BELOW_MS) {
    const tenths = Math.floor(ms / MS_PER_TENTH_SECOND);
    return `${(tenths / TENTHS_PER_SECOND).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(ms / MS_PER_SECOND);
  if (totalSeconds < SECONDS_PER_MINUTE) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  if (totalMinutes < MINUTES_PER_HOUR) {
    return `${totalMinutes}m ${pad2(totalSeconds % SECONDS_PER_MINUTE)}s`;
  }
  return `${Math.floor(totalMinutes / MINUTES_PER_HOUR)}h ${pad2(totalMinutes % MINUTES_PER_HOUR)}m`;
}
