// Typed agent errors — gives the renderer a structured payload it can
// render with a title, a body message, an optional retry hint, and the
// raw underlying error for debugging.
//
// Classifies backend errors (HTTP status codes, keyword matches) into a
// stable `ErrorCode` set so the UI can display friendly copy without
// needing to special-case raw strings.

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
  /** Raw underlying error for the diagnostics expander. */
  originalError?: string;
}
