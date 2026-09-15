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

export function isLikelyProxyInterception(textLower: string): boolean {
  if (textLower.includes('unexpected html error page') || textLower.includes('network proxy')) {
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
export function extractErrorMessages(error: unknown): string {
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
