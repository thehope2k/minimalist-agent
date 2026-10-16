import { describe, expect, it } from 'vitest';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { leafBeforeDivergence } from './session-fork';

const T0 = Date.parse('2026-10-15T10:00:00.000Z');

function userEntry(id: string, parentId: string | null, text: string, offsetMs: number) {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: new Date(T0 + offsetMs).toISOString(),
    message: { role: 'user', content: [{ type: 'text', text }] },
  } as unknown as SessionEntry;
}

function assistantEntry(id: string, parentId: string, offsetMs: number) {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: new Date(T0 + offsetMs).toISOString(),
    message: { role: 'assistant', content: [] },
  } as unknown as SessionEntry;
}

const entries = [
  userEntry('u1', null, 'first', 0),
  assistantEntry('a1', 'u1', 5_000),
  userEntry('u2', 'a1', 'continue', 10_000),
  assistantEntry('a2', 'u2', 15_000),
  userEntry('u3', 'a2', 'continue', 20_000),
];

describe('leafBeforeDivergence', () => {
  it('cuts before the matching user entry even when Pi stamped it before createdAt', () => {
    expect(leafBeforeDivergence(entries, { text: 'continue', createdAtMs: T0 + 13_000 })).toEqual({
      leafId: 'a1',
      exact: true,
    });
  });

  it('returns no leaf when the divergence message is the first one', () => {
    expect(leafBeforeDivergence(entries, { text: 'first', createdAtMs: T0 + 3_000 })).toEqual({
      leafId: null,
      exact: true,
    });
  });

  it('disambiguates repeated text by closest timestamp', () => {
    expect(leafBeforeDivergence(entries, { text: 'continue', createdAtMs: T0 + 21_000 })).toEqual({
      leafId: 'a2',
      exact: true,
    });
  });

  it('does not bound the gap for a text match', () => {
    const farAway = { text: 'first', createdAtMs: T0 + 10 * 60_000 };
    const list = [
      userEntry('u1', null, 'one', 0),
      assistantEntry('a1', 'u1', 1_000),
      userEntry('u2', 'a1', 'later', 5_000),
    ];

    expect(leafBeforeDivergence(list, { ...farAway, text: 'later' })).toEqual({
      leafId: 'a1',
      exact: true,
    });
  });

  it('falls back to a nearby user entry, flagged approximate, when expansion changed the text', () => {
    const expanded = userEntry('u2', 'a1', '[Mentioned skill] PROD', 10_000);
    const list = [entries[0]!, entries[1]!, expanded];

    expect(leafBeforeDivergence(list, { text: '@skill PROD', createdAtMs: T0 + 9_000 })).toEqual({
      leafId: 'a1',
      exact: false,
    });
  });

  it('ignores a distant user entry and cuts at the last entry before createdAt', () => {
    const neverRecorded = { text: 'aborted turn', createdAtMs: T0 + 5 * 60_000 };
    const list = [
      userEntry('u1', null, 'first', 0),
      assistantEntry('a1', 'u1', 5_000),
      userEntry('u2', 'a1', 'much later', 10 * 60_000),
    ];

    expect(leafBeforeDivergence(list, neverRecorded)).toEqual({ leafId: 'a1', exact: false });
  });

  it('matches text that follows an injected preamble', () => {
    const list = [
      userEntry('u1', null, 'one', 0),
      assistantEntry('a1', 'u1', 1_000),
      userEntry('u2', 'a1', '<scratch_directory>x</scratch_directory>\n\nhello', 60_000),
    ];

    expect(leafBeforeDivergence(list, { text: 'hello', createdAtMs: T0 + 2_000 })).toEqual({
      leafId: 'a1',
      exact: true,
    });
  });

  it('returns no leaf when there are no entries', () => {
    expect(leafBeforeDivergence([], { text: 'x', createdAtMs: T0 })).toEqual({
      leafId: null,
      exact: false,
    });
  });
});
