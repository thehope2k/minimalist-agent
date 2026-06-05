// Ephemeral hosted-link transport for session exports.
//
// Uploads a self-contained HTML export to BrewPage (https://brewpage.app), a
// free, no-signup instant host. We publish to a CUSTOM namespace so the page
// is *unlisted* — excluded from the public gallery and search sitemap, reachable
// only by the exact random short URL. Content auto-expires at the chosen TTL;
// the returned ownerToken lets us revoke early.
//
// Privacy posture: anyone with the link can read it (no password by default),
// so redaction still happens upstream in the renderer generator. The link is
// the secret; ids are 10 random chars.

import { APP_USER_AGENT } from '../oauth/claude-config';

const BASE = 'https://brewpage.app';
// Unlisted namespace shared by all installs. Privacy comes from the random id,
// not the namespace; list endpoints require the owner token, so this can't be
// enumerated by others.
const NAMESPACE = 'minimalist-agent';
const MAX_BYTES = 5 * 1024 * 1024; // BrewPage HTML limit
const DEFAULT_TTL_DAYS = 15;

export interface PublishInput {
  html: string;
  /** Used as the page title fallback + Save filename in BrewPage's top bar. */
  filename: string;
  ttlDays?: number;
}

export interface PublishResult {
  url: string;
  namespace: string;
  id: string;
  ownerToken: string;
  expiresAt: string;
  ttlDays: number;
}

export interface RevokeInput {
  namespace: string;
  id: string;
  ownerToken: string;
}

function clampTtl(days?: number): number {
  if (!days || !Number.isFinite(days)) return DEFAULT_TTL_DAYS;
  return Math.min(30, Math.max(1, Math.round(days)));
}

export async function publishExport(input: PublishInput): Promise<PublishResult> {
  const bytes = Buffer.byteLength(input.html, 'utf-8');
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Export is ${(bytes / 1024 / 1024).toFixed(1)} MB — over BrewPage's 5 MB limit. ` +
        `Use “Save…” to write a file instead, or export in summary mode.`,
    );
  }

  const ttlDays = clampTtl(input.ttlDays);
  const url = `${BASE}/api/html?ns=${NAMESPACE}&ttl=${ttlDays}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': APP_USER_AGENT,
      },
      body: JSON.stringify({
        content: input.html,
        filename: `${input.filename}.html`,
        showTopBar: true,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach the share host: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Share host returned ${res.status}. ${body.slice(0, 200)}`.trim());
  }

  const data = (await res.json()) as {
    id?: string;
    namespace?: string;
    link?: string;
    ownerToken?: string;
    expiresAt?: string;
  };
  if (!data.link || !data.id || !data.ownerToken) {
    throw new Error('Share host returned an unexpected response.');
  }

  return {
    url: data.link,
    namespace: data.namespace || NAMESPACE,
    id: data.id,
    ownerToken: data.ownerToken,
    expiresAt: data.expiresAt || '',
    ttlDays,
  };
}

export async function revokeExport(input: RevokeInput): Promise<void> {
  const url = `${BASE}/api/html/${encodeURIComponent(input.namespace)}/${encodeURIComponent(input.id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'User-Agent': APP_USER_AGENT,
      'X-Owner-Token': input.ownerToken,
    },
  });
  // 404 = already gone (expired/deleted) — treat as success (idempotent revoke).
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Revoke failed (${res.status}). ${body.slice(0, 200)}`.trim());
  }
}
