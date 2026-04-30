// PKCE-based OAuth for Claude Pro/Max. The browser flow is a manual paste:
// user authorizes on claude.ai, sees the code on Anthropic's callback page,
// pastes it back into the app. No local listener required.

import { randomBytes, createHash } from 'node:crypto';
import {
  CLAUDE_OAUTH_CONFIG as C,
  STATE_EXPIRY_MS,
  APP_USER_AGENT,
} from './claude-config';

export interface ClaudeTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

interface OAuthState {
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

let currentState: OAuthState | null = null;

function genVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function genState(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generate fresh PKCE + state, return the authorization URL the caller
 * should open in the user's browser.
 */
export function prepareLoginUrl(): string {
  const state = genState();
  const codeVerifier = genVerifier();
  const codeChallenge = challengeFor(codeVerifier);

  currentState = {
    state,
    codeVerifier,
    expiresAt: Date.now() + STATE_EXPIRY_MS,
  };

  const params = new URLSearchParams({
    code: 'true',
    client_id: C.CLIENT_ID,
    response_type: 'code',
    redirect_uri: C.REDIRECT_URI,
    scope: C.SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return `${C.AUTH_URL}?${params.toString()}`;
}

export function clearLoginState(): void {
  currentState = null;
}

/**
 * Exchange an authorization code (pasted by the user) for access + refresh tokens.
 */
export async function exchangeCode(authorizationCode: string): Promise<ClaudeTokens> {
  if (!currentState) {
    throw new Error(
      'No OAuth flow in progress. Click "Sign in" again to start over.',
    );
  }
  if (Date.now() > currentState.expiresAt) {
    clearLoginState();
    throw new Error('OAuth flow expired (older than 10 minutes). Try again.');
  }

  // Strip URL fragments / extra params if pasted from address bar.
  const cleanCode =
    authorizationCode.split('#')[0]?.split('&')[0]?.trim() ?? authorizationCode;

  const body = {
    grant_type: 'authorization_code',
    client_id: C.CLIENT_ID,
    code: cleanCode,
    redirect_uri: C.REDIRECT_URI,
    code_verifier: currentState.codeVerifier,
    state: currentState.state,
  };

  const res = await fetch(C.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': APP_USER_AGENT,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await formatError(res, 'Token exchange'));
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  clearLoginState();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scopes: data.scope?.split(' ').filter(Boolean),
  };
}

/**
 * Use a refresh token to get a fresh access token.
 * Call this before any request if `isExpired(expiresAt)` returns true.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<ClaudeTokens> {
  const body = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: C.CLIENT_ID,
  };

  const res = await fetch(C.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': APP_USER_AGENT,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await formatError(res, 'Token refresh'));
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    // Some IdPs rotate refresh tokens; fall back to the old one if not.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

export function isExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  // 5-minute buffer to avoid races at request time.
  return Date.now() + 5 * 60 * 1000 >= expiresAt;
}

async function formatError(res: Response, label: string): Promise<string> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    text = `${res.status} ${res.statusText}`;
  }
  try {
    const json = JSON.parse(text);
    return `${label} failed: ${res.status} - ${json.error_description ?? json.error ?? text}`;
  } catch {
    return `${label} failed: ${res.status} - ${text}`;
  }
}
