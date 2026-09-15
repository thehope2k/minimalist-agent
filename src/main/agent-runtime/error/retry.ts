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
  const inline =
    /retry(?:\s+(?:after|in))?\s+(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?)\b/i.exec(text);
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
