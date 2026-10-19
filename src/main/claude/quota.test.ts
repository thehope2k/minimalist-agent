import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { fetchClaudeQuota } from './quota';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchClaudeQuota', () => {
  it('maps session, weekly and model-scoped windows', async () => {
    const fetch = mockFetch(200, {
      five_hour: { utilization: 12.5, resets_at: '2026-10-19T05:00:00Z' },
      seven_day: { utilization: 40, resets_at: '2026-10-24T00:00:00Z' },
      seven_day_opus: { utilization: 3, resets_at: null },
      seven_day_sonnet: null,
    });

    const quota = await fetchClaudeQuota('sk-ant-oat-test');

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-ant-oat-test');
    expect(quota).toEqual({
      planType: null,
      primary: {
        usedPercent: 12.5,
        windowMinutes: 300,
        resetsAt: Date.parse('2026-10-19T05:00:00Z'),
      },
      secondary: {
        usedPercent: 40,
        windowMinutes: 10080,
        resetsAt: Date.parse('2026-10-24T00:00:00Z'),
      },
      extraWindows: [
        { label: '7d Opus', window: { usedPercent: 3, windowMinutes: 10080, resetsAt: null } },
      ],
      creditsBalance: null,
      unlimitedCredits: false,
    });
  });

  it('returns an error for non-2xx responses', async () => {
    mockFetch(401, { error: 'unauthorized' });
    const result = await fetchClaudeQuota('bad');
    expect(result).toEqual({ error: expect.stringContaining('HTTP 401') });
  });
});
