// Resolve a connection slug into fresh, ready-to-use auth for a backend.
//
// Branches on the connection's `providerType`:
//   github-copilot / openai-codex / anthropic → returns ResolvedOAuthAuth
//   local / openai-compatible / codemie-sso → returns ResolvedApiAuth
//
// OAuth tokens are refreshed if within their 5-minute expiry buffer.
// A per-slug mutex coalesces concurrent refreshes so concurrent sends on
// the same connection don't race on /token. Hard refresh-token rejections
// (`invalid_grant` family) clear the stored credential to force re-auth.
//
// Lives in main, never the renderer — the access token never crosses the
// IPC boundary back to JS once it has been refreshed.

import { isExpired as isCopilotExpired, refreshCopilotTokens } from '../oauth/copilot-flow';
import { isExpired as isChatGptExpired, refreshChatGptTokens } from '../oauth/chatgpt-flow';
import { isExpired as isClaudeExpired, refreshClaudeTokens } from '../oauth/claude-flow';
import type { PkceTokens } from '../oauth/pkce-browser-login';
import {
  type Credential,
  type OAuthCred,
  deleteCredential,
  setCredential,
} from '../storage/credentials';
import { getCredential, listConnections, type ConnectionMeta } from '../storage/connections';
import type { ResolvedAuth } from '../agent-runtime/auth';
import { createLogger } from '../logger';
import { ensureCodeMieProxy } from '../codemie/proxy';
import { raceAbort, withDeadline } from '../../shared/with-timeout';
import { AUTH_REFRESH_CEILING_MS } from '../../shared/timeouts';

const log = createLogger('auth');

const refreshInFlight = new Map<string, Promise<OAuthCred>>();

/** Bounded by AUTH_REFRESH_CEILING_MS; each provider refresh() call also
 *  carries its own AbortSignal.timeout(), so the underlying fetch itself is
 *  bounded too. `signal` here only cancels this caller's own wait on the
 *  shared in-flight promise — aborting it doesn't cancel the real fetch, so
 *  a second attempt would still race it on the same refresh token if it
 *  outlives this caller's timeout. */
function guardedRefresh(
  slug: string,
  label: string,
  perform: () => Promise<OAuthCred>,
  signal?: AbortSignal,
): Promise<OAuthCred> {
  const existing = refreshInFlight.get(slug);
  if (existing) {
    // Confirms/refutes cross-session serialization: a second caller for the
    // same connection slug joins the first caller's refresh instead of
    // starting its own, so its turn is blocked for however long that first
    // refresh takes.
    log.info(`${label} joining an in-flight refresh already started for ${slug}`);
  }
  const shared = existing ?? startRefresh(slug, label, perform);
  return signal ? raceAbort(shared, signal) : shared;
}

function startRefresh(
  slug: string,
  label: string,
  perform: () => Promise<OAuthCred>,
): Promise<OAuthCred> {
  const startedAt = Date.now();
  log.info(`${label} starting`);
  const promise = withDeadline(perform, { ceilingMs: AUTH_REFRESH_CEILING_MS, label })
    .then((result) => {
      log.info(`${label} succeeded in ${Date.now() - startedAt}ms`);
      return result;
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name === 'DeadlineExceededError') {
        log.warn(`${label} did not respond — releasing lock:`, msg);
      } else {
        log.warn(`${label} failed after ${Date.now() - startedAt}ms:`, msg);
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

export async function resolveAuthForSlug(
  slug: string,
  signal?: AbortSignal,
  callerTag?: string,
): Promise<ResolvedAuth> {
  const conn = findConnection(slug);
  if (!conn) {
    throw new Error(`Connection "${slug}" not found. It may have been deleted from Settings → AI.`);
  }
  const cred = await getCredential(slug);
  if (!cred) {
    throw new Error(
      `No credential stored for connection "${slug}". Re-authenticate from Settings → AI.`,
    );
  }

  if (conn.providerType === 'codemie-sso') {
    if (cred.type !== 'codemie_sso' || !conn.baseUrl) {
      throw new Error('CodeMie SSO session is missing. Sign in again from Settings → AI.');
    }
    if (cred.expiresAt && cred.expiresAt <= Date.now()) {
      throw new Error('CodeMie SSO session has expired. Sign in again from Settings → AI.');
    }
    return {
      type: 'api',
      provider: 'codemie-sso',
      baseUrl: await ensureCodeMieProxy(slug, {
        targetBaseUrl: conn.baseUrl,
        cookies: cred.cookies,
        project: conn.codeMieProject,
        integrationId: conn.codeMieIntegrationId,
      }),
    };
  }

  if (conn.providerType === 'local' || conn.providerType === 'openai-compatible') {
    return {
      type: 'api',
      provider: conn.providerType,
      baseUrl: conn.baseUrl?.replace(/\/+$/, '') ?? 'http://localhost:11434',
      // Remote OpenAI-compatible providers authenticate with a Bearer key;
      // local Ollama/LM Studio need none.
      apiKey:
        conn.providerType === 'openai-compatible' && cred.type === 'api_key'
          ? cred.apiKey
          : undefined,
      modelInPath: conn.modelInPath,
    };
  }

  if (cred.type !== 'oauth') {
    throw new Error(
      `Connection "${slug}" is a Pi/Copilot connection but its credential is not OAuth. Re-authenticate from Settings → AI.`,
    );
  }
  if (conn.providerType === 'openai-codex' || conn.providerType === 'anthropic') {
    const fresh = await ensureFreshPkceOAuth(
      PKCE_PROVIDERS[conn.providerType],
      slug,
      cred,
      signal,
      callerTag,
    );
    return {
      type: 'oauth',
      provider: conn.providerType,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: fresh.expiresAt,
    };
  }
  const fresh = await ensureFreshCopilotOAuth(slug, cred, signal, callerTag);
  return {
    type: 'oauth',
    provider: 'github-copilot',
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken,
    expiresAt: fresh.expiresAt,
  };
}

/* --------------------------- Copilot OAuth ------------------------------ */

async function ensureFreshCopilotOAuth(
  slug: string,
  cred: OAuthCred,
  signal?: AbortSignal,
  callerTag?: string,
): Promise<OAuthCred> {
  if (!isCopilotExpired(cred.expiresAt)) return cred;

  if (!cred.refreshToken) {
    throw new Error(
      'GitHub Copilot session expired and no GitHub token is stored to refresh it. Sign in again from Settings → AI.',
    );
  }

  return guardedRefresh(
    slug,
    `Copilot token refresh for ${slug}${callerTag ? ` [${callerTag}]` : ''}`,
    () => performCopilotRefresh(slug, cred),
    signal,
  );
}

async function performCopilotRefresh(slug: string, cred: OAuthCred): Promise<OAuthCred> {
  try {
    const fresh = await refreshCopilotTokens(cred.refreshToken!);
    const next: Credential = {
      type: 'oauth',
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? cred.refreshToken,
      expiresAt: fresh.expiresAt,
      scopes: cred.scopes,
    };
    await setCredential(slug, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unauthorized|invalid|forbidden|401|403/i.test(msg)) {
      log.warn(
        `Copilot OAuth refresh rejected for ${slug} — clearing credential (forced re-auth):`,
        msg,
      );
      try {
        await deleteCredential(slug);
      } catch {
        /* best effort */
      }
      throw new Error(
        `GitHub Copilot session was rejected (${msg}). Sign in again from Settings → AI.`,
      );
    }
    log.error(`Copilot token refresh failed for ${slug}:`, msg);
    throw new Error(`Copilot token refresh failed: ${msg}`);
  }
}

/* ------------------- PKCE browser OAuth (ChatGPT, Claude) ---------------- */

interface PkceProvider {
  /** Human name used in logs and user-facing errors. */
  label: string;
  isExpired: (expiresAt?: number) => boolean;
  refresh: (refreshToken: string) => Promise<PkceTokens>;
}

const PKCE_PROVIDERS: Record<'openai-codex' | 'anthropic', PkceProvider> = {
  'openai-codex': {
    label: 'ChatGPT',
    isExpired: isChatGptExpired,
    refresh: refreshChatGptTokens,
  },
  anthropic: { label: 'Claude', isExpired: isClaudeExpired, refresh: refreshClaudeTokens },
};

async function ensureFreshPkceOAuth(
  provider: PkceProvider,
  slug: string,
  cred: OAuthCred,
  signal?: AbortSignal,
  callerTag?: string,
): Promise<OAuthCred> {
  if (!provider.isExpired(cred.expiresAt)) return cred;

  if (!cred.refreshToken) {
    throw new Error(
      `${provider.label} session expired and no refresh token is stored. Sign in again from Settings → AI.`,
    );
  }

  return guardedRefresh(
    slug,
    `${provider.label} token refresh for ${slug}${callerTag ? ` [${callerTag}]` : ''}`,
    () => performPkceRefresh(provider, slug, cred),
    signal,
  );
}

async function performPkceRefresh(
  provider: PkceProvider,
  slug: string,
  cred: OAuthCred,
): Promise<OAuthCred> {
  const { label } = provider;
  try {
    const fresh = await provider.refresh(cred.refreshToken!);
    const next: Credential = {
      type: 'oauth',
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? cred.refreshToken,
      expiresAt: fresh.expiresAt,
      scopes: cred.scopes,
    };
    await setCredential(slug, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unauthorized|invalid|forbidden|401|403/i.test(msg)) {
      log.warn(
        `${label} OAuth refresh rejected for ${slug} — clearing credential (forced re-auth):`,
        msg,
      );
      try {
        await deleteCredential(slug);
      } catch {
        /* best effort */
      }
      throw new Error(`${label} session was rejected (${msg}). Sign in again from Settings → AI.`);
    }
    log.error(`${label} token refresh failed for ${slug}:`, msg);
    throw new Error(`${label} token refresh failed: ${msg}`);
  }
}
