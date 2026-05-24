// Claude OAuth usage fetcher.
//
// Calls Anthropic's private OAuth usage endpoint used by claude.ai clients:
//   GET https://api.anthropic.com/api/oauth/usage
//
// Response buckets include:
//   five_hour, seven_day, seven_day_opus, seven_day_sonnet, overage

export interface ClaudeUsageEntry {
  rateLimitType: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage';
  utilization: number;
  resetsAt?: number;
  status: 'allowed' | 'allowed_warning' | 'rejected';
}

const CLAUDE_OAUTH_BETA = 'oauth-2025-04-20';

export async function fetchClaudeUsage(
  accessToken: string,
): Promise<ClaudeUsageEntry[] | { error: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'MinimalistAgent',
        'anthropic-beta': CLAUDE_OAUTH_BETA,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `/api/oauth/usage → HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as Partial<Record<ClaudeUsageEntry['rateLimitType'], {
      utilization?: number;
      resets_at?: string | null;
    } | null>>;

    const types: ClaudeUsageEntry['rateLimitType'][] = [
      'five_hour',
      'seven_day',
      'seven_day_opus',
      'seven_day_sonnet',
      'overage',
    ];

    const out: ClaudeUsageEntry[] = [];
    for (const rateLimitType of types) {
      const bucket = data[rateLimitType];
      if (!bucket) continue;
      const raw = typeof bucket.utilization === 'number' ? bucket.utilization : 0;
      const utilization = raw > 1 ? raw / 100 : raw;
      const status: ClaudeUsageEntry['status'] =
        utilization >= 1 ? 'rejected' : utilization >= 0.9 ? 'allowed_warning' : 'allowed';
      const resetsAt = bucket.resets_at ? new Date(bucket.resets_at).getTime() : undefined;
      out.push({ rateLimitType, utilization, resetsAt, status });
    }

    return out;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
