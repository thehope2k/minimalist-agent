// GitHub Copilot usage quota fetcher.
//
// IntelliJ / VS Code / all Copilot IDEs use:
//   GET <copilot-api-base>/copilot_internal/user
//   Authorization: Bearer <github-oauth-token>   ← LONG-LIVED GitHub OAuth token
//   X-GitHub-Api-Version: 2025-05-01
//
// The api base is derived from the token's `proxy-ep=` claim:
//   proxy.individual.githubcopilot.com  →  api.individual.githubcopilot.com
//
// Response for paid plans (Pro / Business / Enterprise) — NEW as of June 1, 2026:
//   ai_credits.included_monthly   ← dollar amount (e.g., 10.00)
//   ai_credits.consumed           ← dollar amount used
//   ai_credits.remaining          ← dollar amount left
//   ai_credits.overage            ← dollar amount over limit
//   quota_reset_date              ← ISO date
//
// Response for free plan (free_limited_copilot):
//   limited_user_quotas.chat      ← remaining count
//   monthly_quotas.chat           ← monthly limit
//   limited_user_reset_date       ← reset timestamp (unix seconds)
//
// LEGACY: Annual plan subscribers still receive quota_snapshots.premium_interactions
// until their plan expires. This is deprecated as of June 1, 2026.
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
  /** Percentage of usage allowance *remaining* this month (0–100). */
  percentRemaining: number;
  /** Monthly allowance. Dollar amount for AI Credits, count for legacy. Null if unlimited. */
  entitlement: number | null;
  /** Usage this month. Dollar amount for AI Credits, count for legacy. Null if unlimited. */
  used: number | null;
  /** Overage amount (dollars for AI Credits, count for legacy). */
  overageCount: number;
  /** Whether the plan allows overage usage. */
  overagePermitted: boolean;
  /** Whether this plan has unlimited usage. */
  unlimited: boolean;
  /** ISO date string — 1st of the next month at 00:00 UTC. */
  resetDate: string;
  /** Normalised plan identifier: 'free' | 'individual' | 'business' | 'enterprise' etc. */
  planType: string | null;
  /** True when using a fallback parsing strategy. */
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
  organization_login_list?: string[];
  // NEW: AI Credits billing (June 1, 2026+)
  token_based_billing?: boolean;
  ai_credits?: {
    included_monthly: number;
    consumed: number;
    remaining: number;
    overage: number;
    overage_permitted?: boolean;
  };
  usage_breakdown?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
  };
  // OLD: Paid plans (deprecated June 1, 2026)
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

function fromAICredits(
  credits: NonNullable<CopilotUserInfoResponse['ai_credits']>,
  resetDate: string,
  planType: string | null,
): CopilotQuota {
  const included = credits.included_monthly;
  const consumed = credits.consumed;
  const remaining = credits.remaining;
  const overage = credits.overage;

  // Calculate percentage remaining
  const pctRemaining = included > 0
    ? Math.round((remaining / included) * 100)
    : 100;

  // Check if unlimited (included === -1 or very large number)
  const isUnlimited = included === -1 || included >= 999999;

  return {
    percentRemaining: Math.max(0, pctRemaining),
    entitlement: isUnlimited ? null : included,
    used: consumed,
    overageCount: overage,
    overagePermitted: credits.overage_permitted ?? overage > 0,
    unlimited: isUnlimited,
    resetDate,
    planType,
    fallback: false,
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
 * Fetch Copilot usage quota using the GitHub OAuth token (long-lived,
 * stored as `refreshToken` in OAuthCred).
 *
 * As of June 1, 2026, GitHub Copilot uses AI Credits (token-based billing)
 * instead of Premium Request Units. This function handles both formats:
 * - NEW: ai_credits (dollar amounts, token-metered)
 * - LEGACY: premium_interactions (request counts, deprecated)
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

  // DEBUG: Log the entire API response
  console.log('[quota] ═══════════════════════════════════════════════');
  console.log('[quota] Raw API Response from GitHub:');
  console.log(JSON.stringify(info, null, 2));
  console.log('[quota] ═══════════════════════════════════════════════');

  const planType = info.copilot_plan ?? null;
  const sku = info.access_type_sku ?? '';
  const resetDate = info.quota_reset_date ?? '';
  const isTokenBilling = info.token_based_billing ?? false;
  const isEnterprise = sku.includes('enterprise') || planType === 'enterprise';

  console.log('[quota] Parsed fields:');
  console.log(`[quota]   - plan: ${planType}`);
  console.log(`[quota]   - sku: ${sku}`);
  console.log(`[quota]   - reset: ${resetDate}`);
  console.log(`[quota]   - token_based_billing: ${isTokenBilling}`);
  console.log(`[quota]   - is_enterprise: ${isEnterprise}`);
  console.log(`[quota]   - has ai_credits: ${!!info.ai_credits}`);
  console.log(`[quota]   - has quota_snapshots: ${!!info.quota_snapshots}`);
  console.log(`[quota]   - has limited_user_quotas: ${!!info.limited_user_quotas}`);

  // NEW: AI Credits billing (June 1, 2026+)
  // This is the new primary billing method — check first.
  if (info.ai_credits) {
    console.log('[quota] ✓ Using AI Credits format (usage-based billing)');
    return fromAICredits(info.ai_credits, resetDate, planType);
  }

  // Free plan uses a different quota structure
  if (sku === 'free_limited_copilot') {
    return fromFreeUser(info);
  }

  // Enterprise with unlimited pooled credits
  // These accounts show token_based_billing=true but no ai_credits field
  // because billing is tracked at the organization level, not per-user.
  if (isEnterprise && isTokenBilling) {
    const snapshots = info.quota_snapshots;
    const premiumSnap = snapshots?.premium_interactions;
    
    // Check if truly unlimited (entitlement=0 and unlimited=true)
    if (premiumSnap?.unlimited && premiumSnap.entitlement === 0) {
      console.log('[quota] ✓ Enterprise account with pooled AI Credits (no per-user limit)');
      return {
        percentRemaining: 100,
        entitlement: null,
        used: null,
        overageCount: 0,
        overagePermitted: true,
        unlimited: true,
        resetDate,
        planType: 'enterprise',
        fallback: false,
      };
    }
  }

  // OLD: Legacy premium request billing (deprecated June 1, 2026)
  // Keep for backward compatibility with annual plan subscribers.
  const snapshots = info.quota_snapshots;
  const premiumSnap = snapshots?.premium_interactions ?? snapshots?.premium_models;
  if (premiumSnap) {
    // Only log as deprecated if NOT enterprise with token billing
    if (!isEnterprise || !isTokenBilling) {
      console.warn('[quota] ⚠️  Using deprecated premium_interactions format (annual plan?)');
    }
    return fromSnapshot(premiumSnap, resetDate, planType, false);
  }

  // No premium_interactions — might be an older response or unlimited plan.
  // Try chat as a graceful fallback.
  if (snapshots?.chat) {
    console.warn('[quota] ⚠️  Falling back to chat snapshot');
    return fromSnapshot(snapshots.chat, resetDate, planType, true);
  }

  // Fully unlimited plan with no quotas in the response
  console.log('[quota] ℹ️  No quota data in response — treating as unlimited');
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
