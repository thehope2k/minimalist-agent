// Jailed `ma-asset://<sessionId>/<relPath>` protocol, resolving only to files
// under that session's own scratch dir. Exists as a scoped alternative to
// widening the sanitize schema to bare `data:` URIs (see
// markdown-sanitize-schema.ts) — content stays on disk, size-bounded, instead
// of being inlined as arbitrary bytes.
//
// registerAssetProtocolAsPrivileged() must run before app.whenReady() —
// Electron only accepts privileged-scheme registration at Chromium startup.

import { protocol, net } from 'electron';
import { realpathSync, existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Paths } from '../storage/paths';
import { createLogger } from '../logger';

const log = createLogger('asset-protocol');

export const ASSET_PROTOCOL_SCHEME = 'ma-asset';

export function registerAssetProtocolAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      },
    },
  ]);
}

// Returns null (never throws) for anything outside the jail — missing file,
// `..` traversal, or a symlink escape — so callers can treat null as "404".
function resolveJailedPath(requestUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${ASSET_PROTOCOL_SCHEME}:`) return null;

  const sessionId = parsed.hostname;
  if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) return null;

  const relPath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  if (!relPath) return null;

  const jailRoot = join(Paths.sessionsDir(), sessionId, 'scratch');
  const candidate = normalize(join(jailRoot, relPath));
  if (candidate !== jailRoot && !candidate.startsWith(jailRoot + sep)) return null;
  if (!existsSync(candidate)) return null;

  // realpath, not just normalize(), because a symlink inside scratch/ can
  // point outside the jail without any literal `..` segment to catch.
  try {
    const real = realpathSync(candidate);
    const realJailRoot = realpathSync(jailRoot);
    if (real !== realJailRoot && !real.startsWith(realJailRoot + sep)) return null;
    return real;
  } catch {
    return null;
  }
}

export function registerAssetProtocolHandler(): void {
  protocol.handle(ASSET_PROTOCOL_SCHEME, async (request) => {
    const resolved = resolveJailedPath(request.url);
    if (!resolved) {
      log.warn('blocked or missing asset request:', request.url);
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}
