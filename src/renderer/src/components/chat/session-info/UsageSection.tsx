import type { ChatMessage } from '@/lib/chat';

interface UsageSectionProps {
  messages: ChatMessage[];
}

/**
 * Exact token usage for the session — sums the per-turn `usage` numbers
 * Anthropic returns on every `result` message. No estimation.
 */
export function UsageSection({ messages }: UsageSectionProps) {
  let inputTotal = 0;
  let outputTotal = 0;
  let cacheReadTotal = 0;
  let cacheWriteTotal = 0;
  let turns = 0;

  for (const m of messages) {
    if (m.role !== 'assistant' || !m.usage) continue;
    turns++;
    inputTotal += m.usage.inputTokens ?? 0;
    outputTotal += m.usage.outputTokens ?? 0;
    cacheReadTotal += m.usage.cacheReadInputTokens ?? 0;
    cacheWriteTotal += m.usage.cacheCreationInputTokens ?? 0;
  }

  if (turns === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Session Usage
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-elevated/30 p-2.5 text-xs text-fg-muted">
        <UsageRow label="Input tokens" value={inputTotal} />
        <UsageRow label="Output tokens" value={outputTotal} />
        {cacheReadTotal > 0 && (
          <UsageRow label="Cache reads" value={cacheReadTotal} />
        )}
        {cacheWriteTotal > 0 && (
          <UsageRow label="Cache writes" value={cacheWriteTotal} />
        )}
        <UsageRow label="Turns" value={turns} />
      </div>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-mono text-fg">{value.toLocaleString()}</span>
    </div>
  );
}
