// Resolved auth handed to a backend at request time. The auth/resolve
// layer guarantees freshness (OAuth tokens refreshed if within their
// expiry buffer) before producing one of these.

export interface AnthropicApiKeyAuth {
  type: 'anthropic_api_key';
  apiKey: string;
}
export interface AnthropicOAuthAuth {
  type: 'anthropic_oauth';
  accessToken: string;
}
export interface CopilotOAuthAuth {
  type: 'copilot_oauth';
  /** Short-lived Copilot API token (contains proxy-ep). */
  accessToken: string;
  /** Long-lived GitHub OAuth token used to refresh `accessToken`. */
  refreshToken?: string;
  expiresAt?: number;
}

export interface LocalApiAuth {
  type: 'local_api';
  /** Base URL of the local model server, e.g. http://localhost:11434 */
  baseUrl: string;
}

export type ResolvedAuth =
  | AnthropicApiKeyAuth
  | AnthropicOAuthAuth
  | CopilotOAuthAuth
  | LocalApiAuth;
