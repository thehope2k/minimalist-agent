import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETRY_ENABLED,
  DEFAULT_RETRY_MAX_RETRIES,
  MAX_RETRY_ATTEMPTS,
  resolveRetrySettings,
} from './retry';

describe('resolveRetrySettings', () => {
  it('falls back to defaults when nothing is configured', () => {
    expect(resolveRetrySettings(undefined)).toEqual({
      enabled: DEFAULT_RETRY_ENABLED,
      maxRetries: DEFAULT_RETRY_MAX_RETRIES,
    });
  });

  it('keeps explicit values', () => {
    expect(resolveRetrySettings({ enabled: false, maxRetries: 5 })).toEqual({
      enabled: false,
      maxRetries: 5,
    });
  });

  it('allows zero retries', () => {
    expect(resolveRetrySettings({ maxRetries: 0 }).maxRetries).toBe(0);
  });

  it('clamps to the allowed range and rounds', () => {
    expect(resolveRetrySettings({ maxRetries: -4 }).maxRetries).toBe(0);
    expect(resolveRetrySettings({ maxRetries: 999 }).maxRetries).toBe(MAX_RETRY_ATTEMPTS);
    expect(resolveRetrySettings({ maxRetries: 2.6 }).maxRetries).toBe(3);
  });
});
