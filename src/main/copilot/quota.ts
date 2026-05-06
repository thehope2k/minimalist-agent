// GitHub Copilot premium-request quota fetcher.
//
// IntelliJ / VS Code / all Copilot IDEs use:
//   GET <copilot-api-base>/copilot_internal/user
//   Authorization: Bearer <copilot-api-token>   ← the SHORT-LIVED token
//   X-GitHub-Api-Version: 2025-05-01
//
// The api base is derived from the token's `proxy-ep=` claim:
//   proxy.individual.githubcopilot.com  →  api.individual.githubcopilot.com
//
// Response for paid plans (Pro / Business / Enterprise):
//   quota_snapshots.premium_interactions.percent_remaining  ← the % bar
//   quota_snapshots.premium_interactions.entitlement        ← monthly limit
//   quota_snapshots.premium_interactions.overage_count      ← billed extras
//   quota_snapshots.premium_interactions.overage_permitted  ← grace enabled
//   quota_reset_date                                        ← ISO date
//
// Response for free plan (free_limited_copilot):
//   limited_user_quotas.chat     ← remaining count
//   monthly_quotas.chat          ← monthly limit
//   limited_user_reset_date      ← reset timestamp (unix seconds)
//
// This approach works for ALL plan types including org/enterprise-managed
// seats because we use our own Copilot API token, not the GitHub billing API.

const FETCH_TIMEOUT_MS = 10_000;
const COPILOT_API_VERSION = '2025-05-01';

const COPILOT_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
  Accept: 'application/json',
} as const;

export interface CopilotQuota {
  /** Percentage of premium requests *remaining* this month (0–100). */
  percentRemaining: number;
  /** Total monthly allowance (entitlement). Null if unlimited. */
  entitlement: number | null;
  /** Requests used this month, derived from percentRemaining × entitlement. */
  used: number | null;
  /** Requests billed as overage (beyond the monthly allowance). */
  overageCount: number;
  /** Whether the plan allows overage usage. */
  overagePermitted: boolean;
  /** Whether this plan has unlimited premium requests. */
  unlimited: boolean;
  /** ISO date string — 1st of the next month at 00:00 UTC. */
  resetDate: string;
  /** Normalised plan identifier: 'free' | 'individual' | 'business' | 'enterprise' etc. */
  planType: string | null;
  /** True when premium_interactions is not available but quota_snapshots is. */
  fallback: boolean;
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

// ── response types ────────────────────────────────────────────────────────────

interface QuotaSnapshot {
  percent_remaining?: number;
  entitlement?: number;
  overage_count?: number;
  overage_permitted?: boolean;
  unlimited?: boolean;
}

interface CopilotUserInfoResponse {
  access_type_sku?: string;
  copilot_plan?: string;
  // Paid plans
  quota_snapshots?: {
    chat?: QuotaSnapshot;
    completions?: QuotaSnapshot;
    premium_interactions?: QuotaSnapshot;
    premium_models?: QuotaSnapshot;
  };
  quota_reset_date?: string;
  // Free plan
  limited_user_quotas?: { chat?: number; completions?: number };
  monthly_quotas?: { chat?: number; completions?: number };
  limited_user_reset_date?: number; // unix seconds
}

// ── quota derivation ──────────────────────────────────────────────────────────

function fromSnapshot(snap: QuotaSnapshot, resetDate: string, planType: string | null, fallback: boolean): CopilotQuota {
  const pct = snap.percent_remaining ?? 100;
  const entitlement = (snap.unlimited || snap.entitlement == null || snap.entitlement === -1)
    ? null
    : snap.entitlement;
  const used = entitlement != null ? Math.round(entitlement * (1 - pct / 100)) : null;

  return {
    percentRemaining: pct,
    entitlement,
    used,
    overageCount: snap.overage_count ?? 0,
    overagePermitted: snap.overage_permitted ?? false,
    unlimited: snap.unlimited ?? entitlement == null,
    resetDate,
    planType,
    fallback,
  };
}

function fromFreeUser(info: CopilotUserInfoResponse): CopilotQuota {
  const chatRemaining = info.limited_user_quotas?.chat ?? 0;
  const chatLimit = info.monthly_quotas?.chat ?? 0;
  const pct = chatLimit > 0 ? Math.round((chatRemaining / chatLimit) * 100) : 0;

  // limited_user_reset_date is unix seconds; convert to ISO date
  let resetDate = '';
  if (info.limited_user_reset_date) {
    resetDate = new Date(info.limited_user_reset_date * 1000).toISOString().split('T')[0];
  } else {
    // fallback: 1st of next month
    const now = new Date();
    const next = now.getUTCMonth() === 11
      ? new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    resetDate = next.toISOString().split('T')[0];
  }

  return {
    percentRemaining: pct,
    entitlement: chatLimit || null,
    used: chatLimit - chatRemaining,
    overageCount: 0,
    overagePermitted: false,
    unlimited: false,
    resetDate,
    planType: 'free',
    fallback: false,
  };
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Fetch premium-request quota using the GitHub OAuth token (long-lived,
 * stored as `refreshToken` in OAuthCred).
 *
 * `copilot_internal/user` is authenticated with the same GitHub OAuth
 * token as `copilot_internal/v2/token` — NOT the short-lived Copilot
 * API token. Using the Copilot API token returns 401 Bad credentials.
 *
 * Works for all plan types including org/enterprise-managed seats.
 */
export async function fetchCopilotQuota(
  githubOAuthToken: string,
): Promise<CopilotQuota | { error: string }> {
  // GitHub OAuth tokens don't contain proxy-ep claims.
  // copilot_internal/* always lives on api.github.com for standard plans.
  // Enterprise support can be added later if needed.
  const apiBase = 'https://api.github.com';

  let res: Response;
  try {
    res = await timedFetch(`${apiBase}/copilot_internal/user`, {
      method: 'GET',
      headers: {
        ...COPILOT_HEADERS,
        Authorization: `Bearer ${githubOAuthToken}`,
        'X-GitHub-Api-Version': COPILOT_API_VERSION,
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: `copilot_internal/user → HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  let info: CopilotUserInfoResponse;
  try {
    info = (await res.json()) as CopilotUserInfoResponse;
  } catch {
    return { error: 'Failed to parse copilot_internal/user response.' };
  }

  const planType = info.copilot_plan ?? null;
  const sku = info.access_type_sku ?? '';

  // Free plan uses a different quota structure
  if (sku === 'free_limited_copilot') {
    return fromFreeUser(info);
  }

  // Paid plans: prefer premium_interactions, fall back to premium_models
  const snapshots = info.quota_snapshots;
  const resetDate = info.quota_reset_date ?? '';

  const premiumSnap = snapshots?.premium_interactions ?? snapshots?.premium_models;
  if (premiumSnap) {
    return fromSnapshot(premiumSnap, resetDate, planType, false);
  }

  // No premium_interactions — might be an older response or unlimited plan.
  // Try chat as a graceful fallback.
  if (snapshots?.chat) {
    return fromSnapshot(snapshots.chat, resetDate, planType, true);
  }

  // Fully unlimited plan with no quotas in the response
  return {
    percentRemaining: 100,
    entitlement: null,
    used: null,
    overageCount: 0,
    overagePermitted: true,
    unlimited: true,
    resetDate,
    planType,
    fallback: false,
  };
}
