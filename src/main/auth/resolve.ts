// Resolve a connection slug into fresh, ready-to-use auth for a backend.
//
// Branches on the connection's `providerType`:
//   anthropic → returns AnthropicApiKeyAuth | AnthropicOAuthAuth
//   pi        → returns CopilotOAuthAuth (today the only Pi sub-provider)
//   local / openai-compatible → returns LocalApiAuth (baseUrl + optional key)
//
// OAuth tokens are refreshed if within their 5-minute expiry buffer.
// A per-slug mutex coalesces concurrent refreshes so concurrent sends on
// the same connection don't race on /token. Hard refresh-token rejections
// (`invalid_grant` family) clear the stored credential to force re-auth.
//
// Lives in main, never the renderer — the access token never crosses the
// IPC boundary back to JS once it has been refreshed.

import { isExpired, refreshTokens } from '../oauth/claude-flow';
import {
  isExpired as isCopilotExpired,
  refreshCopilotTokens,
} from '../oauth/copilot-flow';
import {
  isExpired as isChatGptExpired,
  refreshChatGptTokens,
} from '../oauth/chatgpt-flow';
import {
  type Credential,
  type OAuthCred,
  deleteCredential,
  setCredential,
} from '../storage/credentials';
import {
  getCredential,
  listConnections,
  type ConnectionMeta,
} from '../storage/connections';
import type { ResolvedAuth } from '../agent/backends/types';
import { createLogger } from '../logger';
import { raceAbort, withDeadline } from '../../shared/with-timeout';
import { AUTH_REFRESH_CEILING_MS } from '../../shared/timeouts';

const log = createLogger('auth');

const refreshInFlight = new Map<string, Promise<OAuthCred>>();

/** Bounded by AUTH_REFRESH_CEILING_MS only — no parentSignal, since none of
 *  the three provider refresh() calls accept one, so aborting the shared
 *  promise would just orphan the real fetch and let a second attempt race it
 *  on the same refresh token. `signal` only cancels this caller's own wait. */
function guardedRefresh(
  slug: string,
  label: string,
  perform: () => Promise<OAuthCred>,
  signal?: AbortSignal,
): Promise<OAuthCred> {
  const shared = refreshInFlight.get(slug) ?? startRefresh(slug, label, perform);
  return signal ? raceAbort(shared, signal) : shared;
}

function startRefresh(
  slug: string,
  label: string,
  perform: () => Promise<OAuthCred>,
): Promise<OAuthCred> {
  const promise = withDeadline(perform, { ceilingMs: AUTH_REFRESH_CEILING_MS, label })
    .catch((e) => {
      if (e instanceof Error && e.name === 'DeadlineExceededError') {
        log.warn(`${label} did not respond — releasing lock:`, e.message);
      }
      throw e;
    })
    .finally(() => refreshInFlight.delete(slug));
  refreshInFlight.set(slug, promise);
  return promise;
}

function findConnection(slug: string): ConnectionMeta | undefined {
  return listConnections().find((c) => c.slug === slug);
}

export async function resolveAuthForSlug(slug: string, signal?: AbortSignal): Promise<ResolvedAuth> {
  const conn = findConnection(slug);
  if (!conn) {
    throw new Error(
      `Connection "${slug}" not found. It may have been deleted from Settings → AI.`,
    );
  }
  const cred = getCredential(slug);
  if (!cred) {
    throw new Error(
      `No credential stored for connection "${slug}". Re-authenticate from Settings → AI.`,
    );
  }

  if (conn.providerType === 'local' || conn.providerType === 'openai-compatible') {
    return {
      type: 'local_api',
      baseUrl: conn.baseUrl?.replace(/\/+$/, '') ?? 'http://localhost:11434',
      // Remote OpenAI-compatible providers authenticate with a Bearer key;
      // local Ollama/LM Studio need none.
      apiKey:
        conn.providerType === 'openai-compatible' && cred.type === 'api_key'
          ? cred.apiKey
          : undefined,
    };
  }

  if (conn.providerType === 'pi') {
    if (cred.type !== 'oauth') {
      throw new Error(
        `Connection "${slug}" is a Pi/Copilot connection but its credential is not OAuth. Re-authenticate from Settings → AI.`,
      );
    }
    if (conn.piAuthProvider === 'openai-codex') {
      const fresh = await ensureFreshChatGptOAuth(slug, cred, signal);
      return {
        type: 'copilot_oauth',
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        expiresAt: fresh.expiresAt,
      };
    }
    const fresh = await ensureFreshCopilotOAuth(slug, cred, signal);
    return {
      type: 'copilot_oauth',
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: fresh.expiresAt,
    };
  }

  // anthropic
  if (cred.type === 'api_key') {
    return { type: 'anthropic_api_key', apiKey: cred.apiKey };
  }
  const fresh = await ensureFreshAnthropicOAuth(slug, cred, signal);
  return { type: 'anthropic_oauth', accessToken: fresh.accessToken };
}

/* --------------------------- Anthropic OAuth ---------------------------- */

async function ensureFreshAnthropicOAuth(
  slug: string,
  cred: OAuthCred,
  signal?: AbortSignal,
): Promise<OAuthCred> {
  if (!isExpired(cred.expiresAt)) return cred;

  if (!cred.refreshToken) {
    throw new Error(
      'Claude OAuth session expired and no refresh token is available. Re-authenticate from Settings → AI.',
    );
  }

  return guardedRefresh(slug, `Claude OAuth refresh for ${slug}`, () =>
    performAnthropicRefresh(slug, cred), signal,
  );
}

async function performAnthropicRefresh(
  slug: string,
  cred: OAuthCred,
): Promise<OAuthCred> {
  try {
    const fresh = await refreshTokens(cred.refreshToken!);
    const next: Credential = {
      type: 'oauth',
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? cred.refreshToken,
      expiresAt: fresh.expiresAt,
      scopes: fresh.scopes ?? cred.scopes,
    };
    setCredential(slug, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /invalid_grant|invalid_refresh_token|refresh token (?:not found|invalid)/i.test(
        msg,
      )
    ) {
      log.warn(`Claude OAuth refresh rejected for ${slug} — clearing credential (forced re-auth):`, msg);
      try { deleteCredential(slug); } catch { /* best effort */ }
      throw new Error(
        `Claude OAuth session expired and could not be refreshed (${msg}). Sign in again from Settings → AI.`,
      );
    }
    log.error(`Claude OAuth token refresh failed for ${slug}:`, msg);
    throw new Error(`Token refresh failed: ${msg}`);
  }
}

/* --------------------------- Copilot OAuth ------------------------------ */

async function ensureFreshCopilotOAuth(
  slug: string,
  cred: OAuthCred,
  signal?: AbortSignal,
): Promise<OAuthCred> {
  if (!isCopilotExpired(cred.expiresAt)) return cred;

  if (!cred.refreshToken) {
    throw new Error(
      'GitHub Copilot session expired and no GitHub token is stored to refresh it. Sign in again from Settings → AI.',
    );
  }

  return guardedRefresh(slug, `Copilot token refresh for ${slug}`, () =>
    performCopilotRefresh(slug, cred), signal,
  );
}

async function performCopilotRefresh(
  slug: string,
  cred: OAuthCred,
): Promise<OAuthCred> {
  try {
    const fresh = await refreshCopilotTokens(cred.refreshToken!);
    const next: Credential = {
      type: 'oauth',
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? cred.refreshToken,
      expiresAt: fresh.expiresAt,
      scopes: cred.scopes,
    };
    setCredential(slug, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unauthorized|invalid|forbidden|401|403/i.test(msg)) {
      log.warn(`Copilot OAuth refresh rejected for ${slug} — clearing credential (forced re-auth):`, msg);
      try { deleteCredential(slug); } catch { /* best effort */ }
      throw new Error(
        `GitHub Copilot session was rejected (${msg}). Sign in again from Settings → AI.`,
      );
    }
    log.error(`Copilot token refresh failed for ${slug}:`, msg);
    throw new Error(`Copilot token refresh failed: ${msg}`);
  }
}

/* --------------------------- ChatGPT Plus (Codex) OAuth ----------------- */

async function ensureFreshChatGptOAuth(
  slug: string,
  cred: OAuthCred,
  signal?: AbortSignal,
): Promise<OAuthCred> {
  if (!isChatGptExpired(cred.expiresAt)) return cred;

  if (!cred.refreshToken) {
    throw new Error(
      'ChatGPT Plus session expired and no refresh token is stored. Sign in again from Settings → AI.',
    );
  }

  return guardedRefresh(slug, `ChatGPT Plus token refresh for ${slug}`, () =>
    performChatGptRefresh(slug, cred), signal,
  );
}

async function performChatGptRefresh(
  slug: string,
  cred: OAuthCred,
): Promise<OAuthCred> {
  try {
    const fresh = await refreshChatGptTokens(cred.refreshToken!);
    const next: Credential = {
      type: 'oauth',
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? cred.refreshToken,
      expiresAt: fresh.expiresAt,
      scopes: cred.scopes,
    };
    setCredential(slug, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unauthorized|invalid|forbidden|401|403/i.test(msg)) {
      log.warn(`ChatGPT OAuth refresh rejected for ${slug} — clearing credential (forced re-auth):`, msg);
      try { deleteCredential(slug); } catch { /* best effort */ }
      throw new Error(
        `ChatGPT Plus session was rejected (${msg}). Sign in again from Settings → AI.`,
      );
    }
    log.error(`ChatGPT Plus token refresh failed for ${slug}:`, msg);
    throw new Error(`ChatGPT Plus token refresh failed: ${msg}`);
  }
}
