import type { AgentError } from './types';
import { extractRetryAfterMs } from './retry';
import { buildError } from './definitions';
import { extractErrorMessages, isLikelyProxyInterception } from './payload-analysis';

/* ---------- main parse entry ------------------------------------ */

/**
 * Map an arbitrary thrown error / string into a typed AgentError.
 * Keyword matching is ordered carefully — more-specific patterns first
 * so e.g. "tool not supported" doesn't get swallowed by "model".
 */
export function parseError(error: unknown): AgentError {
  // Special case: AbortError from the backend / our AbortController.
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || /aborted|cancell?ed/i.test(error.message))
  ) {
    return buildError('aborted', error.message);
  }

  const fullText = extractErrorMessages(error);
  const original = error instanceof Error ? error.message : String(error);
  const lower = fullText.toLowerCase();

  // Tool-support errors must be checked *before* model errors — they
  // often contain "model" and would be misclassified.
  if (
    lower.includes('no endpoints found that support tool use') ||
    lower.includes('does not support tool') ||
    lower.includes('tool_use is not supported') ||
    lower.includes('function calling not available') ||
    lower.includes('tools are not supported') ||
    lower.includes("doesn't support tool") ||
    lower.includes('tool use is not supported') ||
    (lower.includes('tool') && lower.includes('not') && lower.includes('support'))
  ) {
    return buildError('model_no_tool_support', original);
  }

  if (
    lower.includes('is not a valid model') ||
    lower.includes('model not found') ||
    lower.includes('invalid model') ||
    lower.includes('model identifier is invalid')
  ) {
    return buildError('invalid_model', original);
  }

  // Proxy / captive-portal HTML pages. Must come before status codes:
  // a 502 Cloudflare page or 401 proxy login would otherwise be
  // misclassified as service_error or invalid_api_key.
  if (isLikelyProxyInterception(lower)) {
    return buildError('proxy_error', original);
  }

  if (
    lower.includes('402') ||
    lower.includes('payment required') ||
    // Pi/Copilot phrasing for subscription-tier issues.
    lower.includes('subscription required') ||
    lower.includes('quota exceeded') ||
    lower.includes('copilot subscription') ||
    // OpenAI-style quota/credit exhaustion — arrives as a 429, but it's a
    // billing issue, not a transient rate limit, so it must be checked
    // before the generic 429 branch below.
    lower.includes('insufficient_quota') ||
    lower.includes('credit_balance_exhausted') ||
    lower.includes('no credits remaining') ||
    lower.includes('you exceeded your current quota')
  ) {
    return buildError('billing_error', original);
  }

  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('authentication failed') ||
    lower.includes('token is expired') ||
    lower.includes('token expired')
  ) {
    if (lower.includes('oauth') || lower.includes('session')) {
      return buildError('expired_oauth_token', original);
    }
    return buildError('invalid_api_key', original);
  }

  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    const err = buildError('rate_limited', original);
    const retryAfterMs = extractRetryAfterMs(original);
    if (retryAfterMs != null) err.retryAfterMs = retryAfterMs;
    return err;
  }

  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('internal server error') ||
    lower.includes('service unavailable') ||
    lower.includes('overloaded')
  ) {
    return buildError('service_error', original);
  }

  if (
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed')
  ) {
    // Provider-aware copy. "Copilot token refresh failed: fetch failed"
    // means we couldn't reach GitHub to renew the OAuth token — the token
    // itself isn't necessarily expired, the refresh call just couldn't
    // complete (DNS, VPN, firewall, captive portal, offline).
    if (lower.includes('copilot') && lower.includes('token refresh')) {
      return buildError('network_error', original, {
        title: 'Could not refresh Copilot token',
        message:
          "Couldn't reach GitHub to renew your Copilot OAuth token. Your token isn't necessarily expired — the refresh request itself failed. Check your internet connection, VPN, or firewall and retry.",
      });
    }
    if (lower.includes('copilot')) {
      return buildError('network_error', original, {
        message:
          "Couldn't reach the Copilot gateway (api.githubcopilot.com). Check your internet connection, VPN, or firewall.",
      });
    }
    return buildError('network_error', original);
  }

  if (
    lower.includes('image') &&
    (lower.includes('dimension') || lower.includes('8000') || lower.includes('5mb')) &&
    (lower.includes('exceed') || lower.includes('too large'))
  ) {
    return buildError('image_too_large', original);
  }

  // Subprocess crash — try to be a bit smart based on hints.
  if (lower.includes('exited with code') || lower.includes('process exited')) {
    if (lower.includes('api') || lower.includes('key') || lower.includes('credential')) {
      return buildError('invalid_api_key', original);
    }
    return buildError('service_error', original);
  }

  // HTTP/2 / SSE stream truncation from the Copilot gateway.
  // pi-ai's anthropic.js provider (used for Copilot Claude models) throws
  // "Anthropic stream ended before message_stop" when the Copilot SSE
  // stream closes without the final message_stop event. The word "Anthropic"
  // refers to the API wire format, not the connection — map it to a clear
  // network error without the confusing brand name.
  if (
    lower.includes('stream ended before') ||
    lower.includes('stream ended without') ||
    lower.includes('before message_stop')
  ) {
    return buildError('network_error', original, {
      title: 'Stream interrupted',
      message:
        'The response stream was cut off before it completed. ' +
        'This is usually a transient gateway issue — retry to continue.',
    });
  }

  // HTTP/2 connection terminated by the Copilot gateway. The Pi SDK
  // auto-retries these internally; this classifier handles the case where
  // all retries are exhausted and the final "terminated" error surfaces.
  if (
    lower.includes('terminated') ||
    lower.includes('http2') ||
    lower.includes('stream was reset') ||
    lower.includes('connection closed')
  ) {
    return buildError('network_error', original, {
      title: 'Connection terminated',
      message:
        'The connection to the API was interrupted. ' +
        'This is usually transient — retry to continue.',
    });
  }

  // Context-window overflow — must be checked before the generic 400 / invalid_request
  // fallback. Anthropic surfaces this as "prompt is too long" or mentions "context window";
  // OpenAI-compat providers (Copilot) use "context_length_exceeded" / "maximum context length".
  if (
    lower.includes('context window') ||
    lower.includes('prompt is too long') ||
    lower.includes('context_length_exceeded') ||
    lower.includes('maximum context length') ||
    lower.includes('too many tokens') ||
    /exceeds.*token.*limit/i.test(lower)
  ) {
    return buildError('context_window_exceeded', original);
  }

  // Generic API rejection (HTTP 400 / invalid_request_error) that didn't match
  // anything more specific above.
  if (
    lower.includes('invalid_request_error') ||
    (lower.includes('400') && lower.includes('bad request'))
  ) {
    return buildError('invalid_request', original);
  }

  return buildError('unknown_error', original);
}
