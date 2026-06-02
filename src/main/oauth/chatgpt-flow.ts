// ChatGPT Plus (Codex) OAuth — wraps the PKCE browser-redirect flow
// exposed by `@earendil-works/pi-ai`.
//
// Unlike Copilot (device-code, no local server), this flow opens the
// user's browser to auth.openai.com and catches the redirect on a
// temporary HTTP server the Pi SDK spins up on localhost:1455.
//
// We persist:
//   accessToken  = OpenAI API key derived from the id_token exchange
//   refreshToken = standard OAuth refresh token (long-lived)

import type { OAuthCredentials } from '@earendil-works/pi-ai/oauth';

export interface ChatGptTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface FlowState {
  abort: AbortController;
  promise: Promise<ChatGptTokens>;
}

let inFlight: FlowState | null = null;

/**
 * Start the PKCE browser-redirect flow. Resolves once the user has
 * authenticated on auth.openai.com and the Pi SDK has exchanged the
 * id_token for an OpenAI API key.
 *
 * `onBrowserOpen` is called with the auth URL so the caller can open
 * the browser and show a "waiting…" UI. `cancelLogin()` aborts.
 */
export function startLogin(
  onBrowserOpen: (url: string) => void,
): Promise<ChatGptTokens> {
  if (inFlight) {
    inFlight.abort.abort();
    inFlight = null;
  }

  const abort = new AbortController();
  const promise = (async (): Promise<ChatGptTokens> => {
    const { loginOpenAICodex } = await import('@earendil-works/pi-ai/oauth');
    const creds: OAuthCredentials = await loginOpenAICodex({
      onAuth: (info: { url: string; instructions?: string }) => {
        onBrowserOpen(info.url);
      },
      onPrompt: async () => '',
      onProgress: (msg: string) => {
        console.log('[chatgpt-oauth]', msg);
      },
    });
    return {
      accessToken: creds.access,
      refreshToken: creds.refresh,
      expiresAt: creds.expires,
    };
  })();

  inFlight = { abort, promise };
  promise.finally(() => {
    if (inFlight && inFlight.promise === promise) inFlight = null;
  });
  return promise;
}

export function cancelLogin(): void {
  if (inFlight) {
    inFlight.abort.abort();
    inFlight = null;
  }
}

/**
 * Refresh a ChatGPT Plus token. The Pi SDK re-runs the id_token →
 * OpenAI API key exchange, returning fresh credentials.
 */
export async function refreshChatGptTokens(
  refreshToken: string,
): Promise<ChatGptTokens> {
  const { refreshOpenAICodexToken } = await import('@earendil-works/pi-ai/oauth');
  const creds = await refreshOpenAICodexToken(refreshToken);
  return {
    accessToken: creds.access,
    refreshToken: (creds.refresh as string) || refreshToken,
    expiresAt: creds.expires as number | undefined,
  };
}

export function isExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  // 5-minute buffer.
  return Date.now() + 5 * 60 * 1000 >= expiresAt;
}
