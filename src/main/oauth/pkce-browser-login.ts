// Shared driver for the Pi SDK's PKCE browser-redirect OAuth providers
// (ChatGPT/Codex, Claude Pro/Max). The SDK opens a temporary localhost
// callback server; we only surface the auth URL and await the tokens.

import type { AuthPrompt, OAuthAuth } from '@earendil-works/pi-ai';
import { createLogger } from '../logger';
import { AUTH_REFRESH_CEILING_MS } from '../../shared/timeouts';

export interface PkceTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

// The SDK falls back to a pasted redirect URL when its callback server can't
// bind; we have no UI for that, so the prompt just waits until cancelled.
function waitForManualCodePrompt(signal?: AbortSignal): Promise<string> {
  return new Promise((_resolve, reject) => {
    const onAbort = (): void => reject(new Error('cancelled'));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function answerLoginPrompt(prompt: AuthPrompt): Promise<string> {
  if (prompt.type === 'select') return Promise.resolve('browser');
  return waitForManualCodePrompt(prompt.signal);
}

export function createPkceBrowserLogin(scope: string, getOAuth: () => OAuthAuth) {
  const log = createLogger(scope);
  let inFlight: { abort: AbortController; promise: Promise<PkceTokens> } | null = null;

  function cancelLogin(): void {
    if (inFlight) {
      inFlight.abort.abort();
      inFlight = null;
    }
  }

  /**
   * Start the flow. `onBrowserOpen` receives the auth URL so the caller can
   * open the browser and show a "waiting…" UI; `cancelLogin()` aborts.
   */
  function startLogin(onBrowserOpen: (url: string) => void): Promise<PkceTokens> {
    cancelLogin();
    const abort = new AbortController();
    const promise = (async (): Promise<PkceTokens> => {
      const creds = await getOAuth().login({
        signal: abort.signal,
        prompt: answerLoginPrompt,
        notify: (event) => {
          if (event.type === 'auth_url') {
            onBrowserOpen(event.url);
          } else if (event.type === 'progress') {
            log.debug('', event.message);
          }
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

  async function refreshTokens(refreshToken: string): Promise<PkceTokens> {
    const creds = await getOAuth().refresh(
      { type: 'oauth', access: '', refresh: refreshToken, expires: 0 },
      AbortSignal.timeout(AUTH_REFRESH_CEILING_MS),
    );
    return {
      accessToken: creds.access,
      refreshToken: creds.refresh || refreshToken,
      expiresAt: creds.expires,
    };
  }

  return { startLogin, cancelLogin, refreshTokens };
}

export function isExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  // 5-minute buffer.
  return Date.now() + 5 * 60 * 1000 >= expiresAt;
}
