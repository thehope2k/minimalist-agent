import type { ChatMessage, MessagePart } from '@/lib/chat';
import { canonicalToolName, summarizeToolCall } from '@/lib/tool-summary';
import { compactNumber } from '../message-list/utils';

interface UsageSectionProps {
  messages: ChatMessage[];
}

/** How many contributors to show — enough to spot the culprit, not a full ledger. */
const TOP_CONTRIBUTORS_LIMIT = 5;

interface Contributor {
  key: string;
  label: string;
  tokens: number;
  groupSize?: number;
}

/** Recurses into subagent transcripts too — they have their own round sequence. */
function collectContributors(parts: MessagePart[], out: Contributor[]): void {
  for (const part of parts) {
    if (part.kind !== 'tool') continue;
    if (part.contextDelta != null && part.contextDelta > 0) {
      out.push({
        key: part.toolUseId,
        label: summarizeToolCall(part.name, part.input) || canonicalToolName(part.name),
        tokens: part.contextDelta,
        groupSize: part.contextDeltaGroupSize,
      });
    }
    if (part.subagent) collectContributors(part.subagent.parts, out);
  }
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

  const contributors: Contributor[] = [];
  for (const m of messages) collectContributors(m.parts, contributors);
  contributors.sort((a, b) => b.tokens - a.tokens);
  const topContributors = contributors.slice(0, TOP_CONTRIBUTORS_LIMIT);

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
      {topContributors.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Biggest Context Contributors
          </div>
          <div className="space-y-1 rounded-md border border-border bg-elevated/30 p-2.5 text-xs text-fg-muted">
            {topContributors.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-fg-subtle" title={c.label}>
                  {c.label}
                  {c.groupSize && c.groupSize > 1 ? ` (batch of ${c.groupSize})` : ''}
                </span>
                <span className="shrink-0 font-mono text-fg">+{compactNumber(c.tokens)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
