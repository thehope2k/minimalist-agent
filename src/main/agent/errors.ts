// Typed agent errors — gives the renderer a structured payload it can
// render with a title, a body message, an optional retry hint, and the
// raw underlying error for debugging.
//
// Modeled after the comprehensive harness pattern: classify SDK errors
// (HTTP status codes, keyword matches, result-message subtypes) into a
// stable `ErrorCode` set so the UI can display friendly copy without
// needing to special-case raw strings.

import type {
  SDKResultError,
} from '@anthropic-ai/claude-agent-sdk';

export type ErrorCode =
  | 'invalid_api_key'
  | 'expired_oauth_token'
  | 'rate_limited'
  | 'service_error'
  | 'network_error'
  | 'proxy_error'
  | 'billing_error'
  | 'model_no_tool_support'
  | 'invalid_model'
  | 'invalid_request'
  | 'context_window_exceeded'
  | 'image_too_large'
  | 'provider_error'
  | 'max_turns_exceeded'
  | 'budget_exceeded'
  | 'execution_error'
  | 'structured_output_retries_exhausted'
  | 'aborted'
  | 'unknown_error';

export interface AgentError {
  code: ErrorCode;
  /** One-line headline shown bold in the UI. */
  title: string;
  /** Longer prose explaining what happened and what (if anything) to do. */
  message: string;
  /** Whether a retry is likely to succeed without user action. */
  canRetry: boolean;
  /** Suggested wait before auto-retry. UI doesn't auto-retry yet — manual. */
  retryDelayMs?: number;
  /**
   * Exact millisecond delay until the API will accept a retry — only set
   * when extracted from a real `retry-after` header / API response body,
   * never a default. UI shows a live countdown when this is present.
   */
  retryAfterMs?: number;
  /** Raw SDK / underlying error for the diagnostics expander. */
  originalError?: string;
}

/**
 * Try to extract an exact retry-after window in milliseconds from an error
 * payload. Anthropic surfaces this in two shapes:
 *   - A `retry-after: N` header (seconds), surfaced verbatim by some SDKs.
 *   - "Please try again in Ns" / "retry in Nm Ns" body strings.
 * Returns null when nothing precise is parseable — we never invent a value.
 */
export function extractRetryAfterMs(text: string): number | null {
  // Header form, e.g. `retry-after: 42` or `Retry-After 42`.
  const header = /retry[-\s]?after[:\s]+(\d+(?:\.\d+)?)\b/i.exec(text);
  if (header) {
    const seconds = parseFloat(header[1]);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds < 24 * 60 * 60) {
      return Math.round(seconds * 1000);
    }
  }
  // "Please retry after Ns" / "retry in N seconds"
  const inline = /retry(?:\s+(?:after|in))?\s+(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?)\b/i.exec(text);
  if (inline) {
    const n = parseFloat(inline[1]);
    const unit = inline[2].toLowerCase();
    if (Number.isFinite(n) && n >= 0) {
      const seconds = unit.startsWith('m') ? n * 60 : n;
      if (seconds < 24 * 60 * 60) return Math.round(seconds * 1000);
    }
  }
  return null;
}

/* ---------- error definitions ----------------------------------- */

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
    message:
      'Your Claude OAuth session has expired. Re-authenticate from Settings → AI.',
    canRetry: false,
  },
  rate_limited: {
    title: 'Rate limited',
    message:
      'Anthropic rate-limited this request. Wait a few seconds and retry.',
    canRetry: true,
    retryDelayMs: 5000,
  },
  service_error: {
    title: 'Service error',
    message:
      'The Anthropic API returned a server error. This usually resolves on its own.',
    canRetry: true,
    retryDelayMs: 2000,
  },
  network_error: {
    title: 'Connection error',
    message:
      'Could not reach the provider API. Check your internet connection, VPN, or firewall.',
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
    title: 'Payment required',
    message:
      'Your Anthropic account has a billing issue. Check your account status at console.anthropic.com.',
    canRetry: false,
  },
  model_no_tool_support: {
    title: 'Model does not support tools',
    message:
      'The selected model does not support tool/function calling, which the agent requires. Pick a tool-capable Claude model.',
    canRetry: false,
  },
  invalid_model: {
    title: 'Invalid model',
    message:
      'The selected model id was rejected by the API. Pick another model in Settings → AI.',
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
      'Enable auto-compaction in Settings → AI to let the agent compress history automatically, ' +
      'or start a new chat session.',
    canRetry: false,
  },
  image_too_large: {
    title: 'Image too large',
    message:
      'The image exceeds API limits (max 8000px or 5 MB). Resize and try again.',
    canRetry: false,
  },
  provider_error: {
    title: 'Provider error',
    message:
      'Anthropic is reporting a transient provider issue. Retry in a moment.',
    canRetry: true,
    retryDelayMs: 5000,
  },
  max_turns_exceeded: {
    title: 'Max turns reached',
    message:
      "The agent hit the maxTurns ceiling before finishing. Raise it in Settings → AI, or ask the assistant to break the task into smaller steps.",
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
      'Anthropic reported an internal failure mid-turn. Partial output (if any) is preserved above.',
    canRetry: true,
    retryDelayMs: 1000,
  },
  structured_output_retries_exhausted: {
    title: 'Structured output retries exhausted',
    message:
      'The model could not produce valid structured output after multiple attempts.',
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
function buildError(
  code: ErrorCode,
  originalError?: string,
  override?: Partial<ErrorDef>,
): AgentError {
  const def = ERROR_DEFINITIONS[code];
  return { code, ...def, ...override, originalError };
}

/* ---------- proxy / HTML interception detection ----------------- */

const HTML_DOC_HINTS = ['<html', '<!doctype html', '<head', '<body', '<title', '<h1'] as const;
const HTML_PROXY_HINTS = [
  'cloudflare',
  'cf-ray',
  'captcha',
  'security check',
  'access denied',
  'attention required',
  'web application firewall',
  'waf',
  'proxy authentication required',
  'sucuri',
  'imperva',
  'akamai',
] as const;
const HTML_STATUS_PATTERN = /\b(400|401|403|407|408|409|429|500|502|503|504)\b/;

function looksLikeHtmlPayload(textLower: string): boolean {
  if (textLower.includes('<!doctype html') || textLower.includes('<html')) {
    return true;
  }
  let n = 0;
  for (const h of HTML_DOC_HINTS) if (textLower.includes(h)) n++;
  return n >= 3;
}

function hasHtmlErrorPageSignals(textLower: string): boolean {
  const titleHit =
    textLower.includes('bad request') ||
    textLower.includes('unauthorized') ||
    textLower.includes('forbidden') ||
    textLower.includes('service unavailable') ||
    textLower.includes('bad gateway') ||
    textLower.includes('gateway timeout') ||
    textLower.includes('proxy authentication required');
  return HTML_STATUS_PATTERN.test(textLower) && titleHit;
}

function isLikelyProxyInterception(textLower: string): boolean {
  if (
    textLower.includes('unexpected html error page') ||
    textLower.includes('network proxy')
  ) {
    return true;
  }
  if (!looksLikeHtmlPayload(textLower)) return false;
  if (HTML_PROXY_HINTS.some((h) => textLower.includes(h))) return true;
  return hasHtmlErrorPageSignals(textLower);
}

/* ---------- error-message extraction ---------------------------- */

/**
 * Walk an error and pull text from it, including nested `cause`,
 * `stdout`/`stderr`/`output` fields that subprocess errors set.
 */
function extractErrorMessages(error: unknown): string {
  const out: string[] = [];
  if (error instanceof Error) {
    out.push(error.message);
    if ('cause' in error && error.cause) {
      out.push(extractErrorMessages(error.cause));
    }
    const e = error as unknown as Record<string, unknown>;
    if (typeof e.stdout === 'string') out.push(e.stdout);
    if (typeof e.stderr === 'string') out.push(e.stderr);
    if (typeof e.output === 'string') out.push(e.output);
  } else {
    out.push(String(error));
  }
  return out.join(' ');
}

/* ---------- main parse entry ------------------------------------ */

/**
 * Map an arbitrary thrown error / string into a typed AgentError.
 * Keyword matching is ordered carefully — more-specific patterns first
 * so e.g. "tool not supported" doesn't get swallowed by "model".
 */
export function parseError(error: unknown): AgentError {
  // Special case: AbortError from the SDK / our AbortController.
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
    lower.includes('copilot subscription')
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
    (lower.includes('dimension') ||
      lower.includes('8000') ||
      lower.includes('5mb')) &&
    (lower.includes('exceed') || lower.includes('too large'))
  ) {
    return buildError('image_too_large', original);
  }

  // SDK subprocess crash — try to be a bit smart based on hints.
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

  // HTTP/2 connection terminated by the Copilot gateway. The pi SDK
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

/* ---------- SDK result-message error subtypes ------------------- */

const RESULT_SUBTYPE_TO_CODE: Record<SDKResultError['subtype'], ErrorCode> = {
  error_max_turns: 'max_turns_exceeded',
  error_max_budget_usd: 'budget_exceeded',
  error_max_structured_output_retries: 'structured_output_retries_exhausted',
  error_during_execution: 'execution_error',
};

/**
 * Build an AgentError from an SDK `result` message with a non-success
 * subtype. The result message also carries `num_turns` and an optional
 * `errors[]` array — we splice both into the body so the user has
 * something concrete to act on.
 */
export function summarizeSdkResultError(r: SDKResultError): AgentError {
  const code = RESULT_SUBTYPE_TO_CODE[r.subtype] ?? 'unknown_error';
  const def = ERROR_DEFINITIONS[code];

  const extras: string[] = [];
  if (typeof r.num_turns === 'number') extras.push(`turns: ${r.num_turns}`);
  if (r.errors?.length) extras.push(r.errors.join('; '));
  const suffix = extras.length ? ` (${extras.join(' — ')})` : '';

  return {
    code,
    title: def.title,
    message: `${def.message}${suffix}`,
    canRetry: def.canRetry,
    retryDelayMs: def.retryDelayMs,
    originalError: `result.subtype=${r.subtype}; stop_reason=${r.stop_reason ?? 'null'}`,
  };
}