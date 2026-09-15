/* ---------- error definitions ----------------------------------- */

import type { AgentError, ErrorCode } from './types';

type ErrorDef = Omit<AgentError, 'code' | 'originalError'>;

const ERROR_DEFINITIONS: Record<ErrorCode, ErrorDef> = {
  invalid_api_key: {
    title: 'Invalid API key',
    message:
      'Your API key was rejected. It may be invalid, revoked, or for a different account. Update it in Settings → AI.',
    canRetry: false,
  },
  expired_oauth_token: {
    title: 'Session expired',
    message: 'Your OAuth session has expired. Re-authenticate from Settings → AI.',
    canRetry: false,
  },
  rate_limited: {
    title: 'Rate limited',
    message: 'The provider rate-limited this request. Wait a few seconds and retry.',
    canRetry: true,
    retryDelayMs: 5000,
  },
  service_error: {
    title: 'Service error',
    message: 'The provider API returned a server error. This usually resolves on its own.',
    canRetry: true,
    retryDelayMs: 2000,
  },
  network_error: {
    title: 'Connection error',
    message: 'Could not reach the provider API. Check your internet connection, VPN, or firewall.',
    canRetry: true,
    retryDelayMs: 1000,
  },
  proxy_error: {
    title: 'Network proxy error',
    message:
      'A proxy, firewall, or captive portal returned an HTML page instead of the API response. Check your proxy / DNS settings.',
    canRetry: true,
    retryDelayMs: 2000,
  },
  billing_error: {
    title: 'Billing issue',
    message:
      'Your AI provider account has a billing or quota issue. Check your account status or upgrade your plan.',
    canRetry: false,
  },
  model_no_tool_support: {
    title: 'Model does not support tools',
    message:
      'The selected model does not support tool/function calling, which the agent requires. Pick a different, tool-capable model.',
    canRetry: false,
  },
  invalid_model: {
    title: 'Invalid model',
    message: 'The selected model id was rejected by the API. Pick another model in Settings → AI.',
    canRetry: false,
  },
  invalid_request: {
    title: 'Invalid request',
    message: 'The API rejected this request.',
    canRetry: true,
  },
  context_window_exceeded: {
    title: 'Context window exceeded',
    message:
      "This session's history has grown beyond the model's context limit. " +
      'The agent compresses older history automatically as it nears the limit; if this still ' +
      'happened, start a new chat session or switch to a model with a larger context window.',
    canRetry: false,
  },
  image_too_large: {
    title: 'Image too large',
    message: 'The image exceeds API limits (max 8000px or 5 MB). Resize and try again.',
    canRetry: false,
  },
  provider_error: {
    title: 'Provider error',
    message: 'The provider is reporting a transient issue. Retry in a moment.',
    canRetry: true,
    retryDelayMs: 5000,
  },
  max_turns_exceeded: {
    title: 'Max turns reached',
    message:
      'The agent hit its tool-use turn ceiling before finishing. Ask it to break the task into smaller steps and continue.',
    canRetry: false,
  },
  budget_exceeded: {
    title: 'Budget reached',
    message: 'The agent stopped because the configured budget cap was hit.',
    canRetry: false,
  },
  execution_error: {
    title: 'Model errored during execution',
    message:
      'The provider reported an internal failure mid-turn. Partial output (if any) is preserved above.',
    canRetry: true,
    retryDelayMs: 1000,
  },
  structured_output_retries_exhausted: {
    title: 'Structured output retries exhausted',
    message: 'The model could not produce valid structured output after multiple attempts.',
    canRetry: true,
  },
  aborted: {
    title: 'Stopped',
    message: 'You cancelled this turn before it finished.',
    canRetry: true,
  },
  unknown_error: {
    title: 'Error',
    message: 'Something went wrong. Retry, or check the diagnostics below.',
    canRetry: true,
  },
};

/** Build an AgentError from a code with optional override of the prose. */
export function buildError(
  code: ErrorCode,
  originalError?: string,
  override?: Partial<ErrorDef>,
): AgentError {
  const def = ERROR_DEFINITIONS[code];
  return { code, ...def, ...override, originalError };
}
