import { EventEmitter } from 'node:events';
import * as undici from 'undici';
import { createLogger } from '../../shared/sub-logger';

const log = createLogger('pi-server:http');

function ignoreUndiciDispatcherError(): void {}

function withUndiciErrorListener<T>(dispatcher: T): T {
  if (dispatcher instanceof EventEmitter) {
    EventEmitter.prototype.on.call(dispatcher, 'error', ignoreUndiciDispatcherError);
  }
  return dispatcher;
}

function createUndiciClient(origin: string | URL, options: undici.Client.Options): undici.Client {
  return withUndiciErrorListener(new undici.Client(origin, options));
}

function createUndiciOriginDispatcher(
  origin: string | URL,
  options: undici.Pool.Options & { connections?: number },
): undici.Dispatcher {
  if (options.connections === 1) {
    return createUndiciClient(origin, options as undici.Client.Options);
  }
  return withUndiciErrorListener(
    new undici.Pool(origin, { ...options, factory: createUndiciClient }),
  );
}

/**
 * Installs a global undici dispatcher bounding every fetch made through the
 * bare global `fetch()` to `timeoutMs` of idle time. Call once, as early as
 * possible in startup, before any tool/model/auth code can issue a fetch.
 *
 * This protects `@earendil-works/pi-ai`'s calls (LLM completions, OAuth
 * refresh) because that package always uses the unqualified global `fetch`,
 * never its own `undici` import. It does NOT protect code that imports
 * `undici` directly and calls `request()`/`Client` — npm installs a separate,
 * non-deduped `undici` copy nested under `@earendil-works/pi-coding-agent`
 * (confirmed via `npm ls undici`), which has its own unconfigured dispatcher
 * unreachable from here.
 */
export function configureHttpIdleTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    log.warn(`invalid HTTP idle timeout ${timeoutMs}ms — leaving default dispatcher in place`);
    return;
  }
  const dispatcher = withUndiciErrorListener(
    new undici.EnvHttpProxyAgent({
      allowH2: false,
      bodyTimeout: timeoutMs,
      headersTimeout: timeoutMs,
      clientFactory: createUndiciClient,
      factory: createUndiciOriginDispatcher,
    } as ConstructorParameters<typeof undici.EnvHttpProxyAgent>[0]),
  );
  undici.setGlobalDispatcher(dispatcher);
  undici.install?.();
  log.info(`HTTP idle timeout configured: ${timeoutMs === 0 ? 'disabled' : `${timeoutMs / 1000}s`}`);
}
