// Claude subscription (Pro/Max) usage fetcher.
//
// Mirrors the private endpoint Claude Code's `/usage` command reads:
//
//   GET https://api.anthropic.com/api/oauth/usage
//   Authorization: Bearer <sk-ant-oat… access token>
//   anthropic-beta: oauth-2025-04-20
//
// Like Codex, Claude meters subscriptions in rolling windows — a 5-hour
// session window plus a 7-day weekly window, and on some plans extra
// model-scoped weekly windows (Opus, Sonnet). `utilization` is already a
// percentage; window lengths aren't reported, so they're fixed here.
//
// Undocumented endpoint, same risk profile as the subscription login itself
// (see docs/CLAUDE-SUBSCRIPTION.md).

import { createLogger } from '../logger';
import type { RateLimitWindow, RollingQuota } from '../../shared/electron-api';

const log = createLogger('claude-quota');

const FETCH_TIMEOUT_MS = 10_000;
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const FIVE_HOURS_MIN = 5 * 60;
const SEVEN_DAYS_MIN = 7 * 24 * 60;

interface UsageWindowRaw {
  utilization?: number | null;
  resets_at?: string | null; // ISO 8601
}

interface OAuthUsageResponse {
  five_hour?: UsageWindowRaw | null;
  seven_day?: UsageWindowRaw | null;
  seven_day_opus?: UsageWindowRaw | null;
  seven_day_sonnet?: UsageWindowRaw | null;
}

function mapWindow(
  raw: UsageWindowRaw | null | undefined,
  windowMinutes: number,
): RateLimitWindow | null {
  if (!raw || raw.utilization == null) return null;
  const resetsAt = raw.resets_at ? Date.parse(raw.resets_at) : NaN;
  return {
    usedPercent: raw.utilization,
    windowMinutes,
    resetsAt: Number.isNaN(resetsAt) ? null : resetsAt,
  };
}

function toRollingQuota(info: OAuthUsageResponse): RollingQuota {
  const extraWindows: NonNullable<RollingQuota['extraWindows']> = [];
  const opus = mapWindow(info.seven_day_opus, SEVEN_DAYS_MIN);
  if (opus) extraWindows.push({ label: '7d Opus', window: opus });
  const sonnet = mapWindow(info.seven_day_sonnet, SEVEN_DAYS_MIN);
  if (sonnet) extraWindows.push({ label: '7d Sonnet', window: sonnet });
  return {
    planType: null,
    primary: mapWindow(info.five_hour, FIVE_HOURS_MIN),
    secondary: mapWindow(info.seven_day, SEVEN_DAYS_MIN),
    extraWindows,
    creditsBalance: null,
    unlimitedCredits: false,
  };
}

/** `accessToken` must be a fresh (non-expired) Claude OAuth access token. */
export async function fetchClaudeQuota(
  accessToken: string,
): Promise<RollingQuota | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: `oauth/usage → HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  let info: OAuthUsageResponse;
  try {
    info = (await res.json()) as OAuthUsageResponse;
  } catch {
    return { error: 'Failed to parse oauth/usage response.' };
  }

  log.debug('Raw oauth/usage response:', JSON.stringify(info));
  return toRollingQuota(info);
}
