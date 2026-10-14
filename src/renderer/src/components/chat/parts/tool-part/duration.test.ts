import { describe, expect, it } from 'vitest';
import {
  formatToolDuration,
  MIN_VISIBLE_TOOL_DURATION_MS,
  shouldShowToolDuration,
} from './duration';

describe('formatToolDuration', () => {
  it.each([
    [1000, '1.0s'],
    [1234, '1.2s'],
    [9999, '9.9s'],
    [10_000, '10s'],
    [45_900, '45s'],
    [60_000, '1m 00s'],
    [123_000, '2m 03s'],
    [3_599_000, '59m 59s'],
    [3_720_000, '1h 02m'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatToolDuration(ms)).toBe(expected);
  });
});

describe('shouldShowToolDuration', () => {
  it('hides sub-second calls and missing durations', () => {
    expect(shouldShowToolDuration(MIN_VISIBLE_TOOL_DURATION_MS - 1, 'done')).toBe(false);
    expect(shouldShowToolDuration(undefined, 'done')).toBe(false);
  });

  it('shows slow finished calls, including errored ones', () => {
    expect(shouldShowToolDuration(MIN_VISIBLE_TOOL_DURATION_MS, 'done')).toBe(true);
    expect(shouldShowToolDuration(5000, 'error')).toBe(true);
  });

  it('never shows while the tool is still running', () => {
    expect(shouldShowToolDuration(5000, 'running')).toBe(false);
  });
});
