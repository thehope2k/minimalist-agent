// Fallback ephemeral HTML hosting transport via meethtml.com.
//
// Used when the primary transport (BrewPage) is unavailable. Anonymous pages
// expire after 24 hours — sufficient for quick share-to-Teams/Slack workflows.
// The edit_token returned by the API acts as the revoke credential.
//
// API: https://meethtml.com/docs
//   POST   /api/v1/publish          → { url, slug, expires_at, edit_token }
//   DELETE /api/v1/pages/:slug      + X-Edit-Token: <token>

import { APP_USER_AGENT } from '../oauth/claude-config';
import type { PublishInput, PublishResult, RevokeInput } from './brewpage';

const BASE = 'https://api.meethtml.com';
const MAX_BYTES = 5 * 1024 * 1024;

export async function publishExportFallback(input: PublishInput): Promise<PublishResult> {
  const bytes = Buffer.byteLength(input.html, 'utf-8');
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Export is ${(bytes / 1024 / 1024).toFixed(1)} MB — over the 5 MB limit. ` +
        `Use "Save…" to write a file instead.`,
    );
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': APP_USER_AGENT,
      },
      body: JSON.stringify({ html: input.html }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach the fallback share host: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Fallback share host returned ${res.status}. ${body.slice(0, 200)}`.trim());
  }

  const data = (await res.json()) as {
    url?: string;
    slug?: string;
    expires_at?: string | null;
    edit_token?: string;
  };

  if (!data.url || !data.slug || !data.edit_token) {
    throw new Error('Fallback share host returned an unexpected response.');
  }

  return {
    url: data.url,
    // Map meethtml fields onto the shared PublishResult shape.
    // edit_token doubles as ownerToken; slug is used as both namespace and id.
    namespace: 'meethtml',
    id: data.slug,
    ownerToken: data.edit_token,
    expiresAt: data.expires_at ?? '',
    ttlDays: 1, // anonymous pages expire after 24 hours
  };
}

export async function revokeExportFallback(input: RevokeInput): Promise<void> {
  if (input.namespace !== 'meethtml') return; // not ours to revoke
  const res = await fetch(`${BASE}/api/v1/pages/${encodeURIComponent(input.id)}`, {
    method: 'DELETE',
    headers: {
      'User-Agent': APP_USER_AGENT,
      'X-Edit-Token': input.ownerToken,
    },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Fallback revoke failed (${res.status}). ${body.slice(0, 200)}`.trim());
  }
}
