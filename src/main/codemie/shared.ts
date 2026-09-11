export const CODEMIE_API_SUFFIX = '/code-assistant-api';

export function codeMieApiBase(url: string): string {
  const baseUrl = url.trim().replace(/\/+$/, '');
  return baseUrl.endsWith(CODEMIE_API_SUFFIX)
    ? baseUrl
    : `${baseUrl}${CODEMIE_API_SUFFIX}`;
}

export function codeMieCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
