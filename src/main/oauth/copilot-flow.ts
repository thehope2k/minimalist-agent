// GitHub Copilot OAuth — wraps the device-code flow exposed by
// `@mariozechner/pi-ai`. The Pi SDK does two things in one call:
//   1. Standard GitHub device-code flow → GitHub OAuth token (long-lived).
//   2. Exchanges the GitHub token → Copilot API token (short-lived, ~1h)
//      whose `proxy-ep=` field tells us which API endpoint to talk to.
// We persist BOTH:
//   accessToken  = Copilot API token (used for chat completions)
//   refreshToken = GitHub OAuth token (used to refresh the Copilot token)

import type { OAuthCredentials } from '@mariozechner/pi-ai/oauth';

export interface CopilotTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface DeviceCodeUpdate {
  userCode: string;
  verificationUri: string;
}

interface FlowState {
  abort: AbortController;
  promise: Promise<CopilotTokens>;
}

let inFlight: FlowState | null = null;

/**
 * Start the device flow. Returns a promise that resolves once the user
 * has authorized on github.com and the Pi SDK has exchanged the GitHub
 * token for a Copilot API token.
 *
 * `onDeviceCode` is invoked once the device code is available so the UI
 * can show it to the user. Calling `cancelLogin()` aborts the flow.
 */
export function startLogin(
  onDeviceCode: (update: DeviceCodeUpdate) => void,
): Promise<CopilotTokens> {
  if (inFlight) {
    inFlight.abort.abort();
    inFlight = null;
  }

  const abort = new AbortController();
  const promise = (async (): Promise<CopilotTokens> => {
    const { loginGitHubCopilot } = await import('@mariozechner/pi-ai/oauth');
    const creds: OAuthCredentials = await loginGitHubCopilot({
      onAuth: (url, instructions) => {
        // Pi formats instructions as "First copy your one-time code: XXXX-YYYY ..."
        const codeMatch = instructions?.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
        const userCode = codeMatch?.[0] ?? '';
        onDeviceCode({ userCode, verificationUri: url });
      },
      // Pi prompts for a GitHub Enterprise domain — empty = github.com.
      onPrompt: async () => '',
      onProgress: (msg) => {
        // Useful for debugging without bloating UI surface area.
        console.log('[copilot-oauth]', msg);
      },
      signal: abort.signal,
    });
    return {
      accessToken: creds.access,
      refreshToken: creds.refresh,
      expiresAt: creds.expires,
    };
  })();

  inFlight = { abort, promise };
  // Detach state once settled so callers can start a fresh flow.
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
 * Refresh a Copilot API token using the GitHub OAuth token (`refreshToken`).
 * The Copilot token expires ~hourly; the GitHub token is long-lived.
 */
export async function refreshCopilotTokens(
  githubRefreshToken: string,
): Promise<CopilotTokens> {
  const { refreshGitHubCopilotToken } = await import(
    '@mariozechner/pi-ai/oauth'
  );
  const creds = await refreshGitHubCopilotToken(githubRefreshToken);
  return {
    accessToken: creds.access,
    // Copilot refresh returns the same long-lived GitHub token (or a new
    // one if rotated); fall back to the original.
    refreshToken: (creds.refresh as string) || githubRefreshToken,
    expiresAt: creds.expires as number | undefined,
  };
}

export function isExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  // 5-minute buffer to avoid races at request time.
  return Date.now() + 5 * 60 * 1000 >= expiresAt;
}
