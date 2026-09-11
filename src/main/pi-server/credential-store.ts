// In-memory CredentialStore for the pi-server subprocess, plus the auth
// refresh round-trip to main (`auth_refresh_request` / `auth_refresh_result`).
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from '@earendil-works/pi-ai';
import { createLogger } from '../../shared/sub-logger';
import { AUTH_REFRESH_CEILING_MS, AUTH_REFRESH_MAIN_ROUNDTRIP_MS } from '../../shared/timeouts';
import { withTimeout } from '../../shared/with-timeout';
import { withOperation } from './operation-tracker';
import { send } from './transport';
import { state, sessionTag } from './state';
import type { MsgAuthRefreshRequest, MsgAuthRefreshResult, MsgInit, MsgTokenUpdate } from '../agent-runtime/pi/protocol';

const log = createLogger('pi-server');

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientOAuthRefreshError(err: unknown): boolean {
  return /oauth refresh failed/i.test(errMessage(err));
}

export const OAUTH_REFRESH_RETRY_DELAY_MS = 500;
const DEFAULT_OAUTH_CREDENTIAL_TTL_MS = 30 * 60 * 1000;

export function toOAuthCredential(cred: { access: string; refresh: string; expires?: number }): OAuthCredential {
  return {
    type: 'oauth',
    access: cred.access,
    refresh: cred.refresh,
    expires: cred.expires ?? Date.now() + DEFAULT_OAUTH_CREDENTIAL_TTL_MS,
  };
}

function requestAuthRefresh(): Promise<MsgAuthRefreshResult> {
  return new Promise((resolve) => {
    const requestId = `authref_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    // A real IPC response and the timeout fallback race to settle the same
    // request; settle() is the single place that deletes the pending entry,
    // so whichever fires first wins and the other sees it's already gone
    // and no-ops instead of resolving twice.
    const settle = (result: MsgAuthRefreshResult) => {
      if (!state.pendingAuthRefresh.delete(requestId)) return;
      clearTimeout(timer);
      resolve(result);
    };
    state.pendingAuthRefresh.set(requestId, { resolve: settle });
    const timer = setTimeout(
      () => settle({ type: 'auth_refresh_result', requestId, error: 'main did not respond in time' }),
      AUTH_REFRESH_MAIN_ROUNDTRIP_MS,
    );
    const req: MsgAuthRefreshRequest = { type: 'auth_refresh_request', requestId, turnId: state.currentTurnId };
    send(req);
  });
}

async function refreshViaMain(): Promise<OAuthCredential | undefined> {
  const startedAt = Date.now();
  const result = await requestAuthRefresh();
  log.info(`Main round-trip refresh took ${Date.now() - startedAt}ms (${result.credential ? 'got credential' : 'no credential'}${result.error ? `, error: ${result.error}` : ''}) [${sessionTag()}]`);
  return result.credential ? toOAuthCredential(result.credential) : undefined;
}

async function refreshWithLocalRetry(
  fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  current: Credential | undefined,
): Promise<Credential | undefined> {
  const startedAt = Date.now();
  // `fn` is the SDK's own refresh closure, carrying whatever AbortSignal the
  // SDK captured internally (tied to the turn, not to any timeout) — we
  // can't make it actually stop, but withTimeout stops *us* waiting on it so
  // a stalled connection here can't wedge every future turn on this session.
  try {
    const result = await withTimeout(fn(current), AUTH_REFRESH_CEILING_MS, 'Local SDK refresh');
    log.info(`Local SDK refresh took ${Date.now() - startedAt}ms [${sessionTag()}]`);
    return result;
  } catch (err) {
    if (!isTransientOAuthRefreshError(err)) throw err;
    log.warn(`transient OAuth refresh failure — retrying once [${sessionTag()}]:`, errMessage(err));
    await delay(OAUTH_REFRESH_RETRY_DELAY_MS);
    return withTimeout(fn(current), AUTH_REFRESH_CEILING_MS, 'Local SDK refresh (retry)');
  }
}

/* In-memory CredentialStore — one instance per pi-server subprocess.        */
/* Credentials are seeded on init and updated via token_update messages.      */
export class InMemoryCredentialStore implements CredentialStore {
  private data = new Map<string, Credential>();

  async read(id: string): Promise<Credential | undefined> {
    return this.data.get(id);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Array.from(this.data.entries()).map(([providerId, c]) => ({ providerId, type: c.type }));
  }

  set(id: string, credential: Credential): void {
    this.data.set(id, credential);
  }

  async modify(
    id: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const current = this.data.get(id);
    const startedAt = Date.now();
    log.info(`Credential refresh starting for ${id} [${sessionTag()}]`);
    try {
      const next = await withOperation('oauth_refresh', async () =>
        (await refreshViaMain()) ?? (await refreshWithLocalRetry(fn, current)),
      );
      log.info(`Credential refresh for ${id} finished in ${Date.now() - startedAt}ms (${next !== undefined ? 'refreshed' : 'unchanged'}) [${sessionTag()}]`);
      if (next !== undefined) this.data.set(id, next);
      return next;
    } catch (e) {
      // Always log completion, even on failure — without this, a rejection
      // (e.g. our own withTimeout firing) leaves no trace at this level since
      // the success-path log above never runs.
      log.warn(`Credential refresh for ${id} failed after ${Date.now() - startedAt}ms: ${errMessage(e)} [${sessionTag()}]`);
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }
}

export async function writeAuthCredential(
  store: InMemoryCredentialStore,
  provider: string,
  cred: MsgInit['auth']['credential'] | MsgTokenUpdate['credential'],
): Promise<void> {
  if (cred.type === 'oauth') {
    store.set(provider, toOAuthCredential(cred));
  } else {
    store.set(provider, { type: 'api_key', key: cred.key } as Credential);
  }
}
