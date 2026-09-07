// ChatGPT (Codex) usage/rate-limit fetcher.
//
// Mirrors the private endpoint Codex CLI itself polls every ~60s
// (see codex-rs/backend-client/src/client/rate_limit_resets.rs,
// `Client::get_rate_limits_with_reset_credits`):
//
//   GET https://chatgpt.com/backend-api/wham/usage
//   Authorization: Bearer <chatgpt-access-token>   ← the OAuth access token itself
//   ChatGPT-Account-Id: <account-id>                ← decoded from the token's JWT claims
//
// Unlike Copilot's monthly-entitlement model, Codex meters usage in rolling
// windows (typically a 5-hour primary window plus a 7-day secondary window)
// rather than a fixed monthly allowance — so the shape returned here is
// windows-with-reset-times, not a single percent-remaining/entitlement pair.
//
// This is an undocumented backend endpoint (not part of OpenAI's public
// API surface) — same risk profile as Copilot's copilot_internal/user.

import { createLogger } from '../logger';

const log = createLogger('chatgpt-quota');

const FETCH_TIMEOUT_MS = 10_000;
const WHAM_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const JWT_ACCOUNT_CLAIM = 'https://api.openai.com/auth';

export interface ChatGptRateLimitWindow {
  /** Percentage of this window's allowance already used (0–100, can exceed 100). */
  usedPercent: number;
  /** Window length in minutes (e.g. 300 for a 5h window, 10080 for 7d). Null if unknown. */
  windowMinutes: number | null;
  /** Epoch ms when this window resets. Null if unknown. */
  resetsAt: number | null;
}

export interface ChatGptQuota {
  /** Normalised plan identifier: 'plus' | 'pro' | 'team' | 'enterprise' etc. */
  planType: string | null;
  /** Short rolling window (typically 5h). Null if the account has no rate limit. */
  primary: ChatGptRateLimitWindow | null;
  /** Longer rolling window (typically 7d). Null if not reported. */
  secondary: ChatGptRateLimitWindow | null;
  /** On-demand credits balance as a decimal string (e.g. "9.99"). Null if not applicable. */
  creditsBalance: string | null;
  /** True when the account has unlimited on-demand credits. */
  unlimitedCredits: boolean;
}

// ── network ───────────────────────────────────────────────────────────────────

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const json = Buffer.from(segments[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function accountIdFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  const authClaim = payload?.[JWT_ACCOUNT_CLAIM] as { chatgpt_account_id?: unknown } | undefined;
  const accountId = authClaim?.chatgpt_account_id;
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : null;
}

// ── response types ────────────────────────────────────────────────────────────

interface RateLimitWindowRaw {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number; // unix seconds
}

interface WhamUsageResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: RateLimitWindowRaw | null;
    secondary_window?: RateLimitWindowRaw | null;
  } | null;
  credits?: {
    unlimited?: boolean;
    balance?: string | null;
  } | null;
}

// ── mapping ───────────────────────────────────────────────────────────────────

const SECONDS_PER_MINUTE = 60;

function mapWindow(raw: RateLimitWindowRaw | null | undefined): ChatGptRateLimitWindow | null {
  if (!raw) return null;
  const windowMinutes = raw.limit_window_seconds
    ? Math.ceil(raw.limit_window_seconds / SECONDS_PER_MINUTE)
    : null;
  return {
    usedPercent: raw.used_percent ?? 0,
    windowMinutes,
    resetsAt: raw.reset_at ? raw.reset_at * 1000 : null,
  };
}

function toChatGptQuota(info: WhamUsageResponse): ChatGptQuota {
  return {
    planType: info.plan_type ?? null,
    primary: mapWindow(info.rate_limit?.primary_window),
    secondary: mapWindow(info.rate_limit?.secondary_window),
    creditsBalance: info.credits?.balance ?? null,
    unlimitedCredits: info.credits?.unlimited ?? false,
  };
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Fetch Codex rate-limit usage for a ChatGPT OAuth connection.
 *
 * `accessToken` must be a fresh (non-expired) ChatGPT access token — the
 * same JWT used to authenticate model requests. The account id required by
 * the endpoint is decoded from the token itself, not passed separately.
 */
export async function fetchChatGptQuota(
  accessToken: string,
): Promise<ChatGptQuota | { error: string }> {
  const accountId = accountIdFromAccessToken(accessToken);
  if (!accountId) {
    return { error: 'Could not extract ChatGPT account id from the access token.' };
  }

  let res: Response;
  try {
    res = await timedFetch(WHAM_USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'ChatGPT-Account-Id': accountId,
        Accept: 'application/json',
        'User-Agent': 'MinimalistAgent',
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: `wham/usage → HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  let info: WhamUsageResponse;
  try {
    info = (await res.json()) as WhamUsageResponse;
  } catch {
    return { error: 'Failed to parse wham/usage response.' };
  }

  log.debug('Raw wham/usage response:', JSON.stringify(info));
  return toChatGptQuota(info);
}
