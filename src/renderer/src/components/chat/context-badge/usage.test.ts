import { describe, expect, it } from 'vitest';
import { buildSegments } from './usage';

const breakdown = {
  systemPrompt: 10_000,
  projectInstructions: 4_000,
  builtinTools: { tokens: 20_000, count: 10 },
  mcpServers: [
    { name: 'docs', tokens: 6_000, count: 5, deferredTokens: 50_000, deferredCount: 40 },
  ],
};

function tokensByKey(segments: ReturnType<typeof buildSegments>) {
  return Object.fromEntries(segments.map((s) => [s.key, s.tokens]));
}

describe('buildSegments', () => {
  it('derives conversation as the measured total minus the fixed estimates', () => {
    const segments = buildSegments({
      used: 100_000,
      contextWindow: 200_000,
      reserveTokens: 16_000,
      breakdown,
    });
    expect(tokensByKey(segments)).toEqual({
      conversation: 60_000,
      builtin: 20_000,
      mcp: 6_000,
      system: 10_000,
      project: 4_000,
      reserve: 16_000,
      free: 84_000,
    });
    const used = segments
      .filter((s) => s.key !== 'reserve' && s.key !== 'free')
      .reduce((sum, s) => sum + s.tokens, 0);
    expect(used).toBe(100_000);
  });

  it('shows a single measured "Used" row without a breakdown', () => {
    const segments = buildSegments({
      used: 50_000,
      contextWindow: 100_000,
      reserveTokens: 10_000,
      breakdown: null,
    });
    expect(segments[0]).toMatchObject({ key: 'conversation', label: 'Used', estimated: false });
    expect(tokensByKey(segments)).toEqual({ conversation: 50_000, reserve: 10_000, free: 40_000 });
  });

  it('shrinks the reserve when usage is already past the compaction threshold', () => {
    const segments = buildSegments({
      used: 95_000,
      contextWindow: 100_000,
      reserveTokens: 10_000,
      breakdown: null,
    });
    expect(tokensByKey(segments)).toEqual({ conversation: 95_000, reserve: 5_000 });
  });
});
