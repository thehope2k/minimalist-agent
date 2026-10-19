import { describe, expect, it } from 'vitest';
import type { Session } from 'electron';
import { formatNetworkEntry, NetworkLog } from './browser-network-log';

type Listener = (details: Record<string, unknown>) => void;

function fakeSession() {
  const listeners: Record<string, Listener> = {};
  const hook = (name: string) => (_filter: unknown, cb: Listener) => {
    listeners[name] = cb;
  };
  const session = {
    webRequest: {
      onSendHeaders: hook('send'),
      onCompleted: hook('completed'),
      onErrorOccurred: hook('error'),
    },
  } as unknown as Session;
  return { session, listeners };
}

function request(id: number, url: string, resourceType = 'xhr') {
  return { id, url, method: 'GET', resourceType, timestamp: 1000 };
}

describe('NetworkLog', () => {
  it('records status, duration, and errors, hiding static assets by default', () => {
    const { session, listeners } = fakeSession();
    const log = new NetworkLog(session);

    listeners.send(request(1, 'http://localhost/api/users'));
    listeners.completed({
      ...request(1, 'http://localhost/api/users'),
      timestamp: 1120,
      statusCode: 500,
      fromCache: false,
    });
    listeners.completed({
      ...request(2, 'http://localhost/logo.png', 'image'),
      statusCode: 200,
      fromCache: true,
    });
    listeners.error({
      ...request(3, 'http://localhost/api/feed'),
      error: 'net::ERR_CONNECTION_REFUSED',
      fromCache: false,
    });

    const visible = log.query({ limit: 50 });
    expect(visible.map((e) => e.url)).toEqual([
      'http://localhost/api/users',
      'http://localhost/api/feed',
    ]);
    expect(formatNetworkEntry(visible[0])).toBe('500 GET xhr 120ms http://localhost/api/users');
    expect(formatNetworkEntry(visible[1])).toContain('ERR net::ERR_CONNECTION_REFUSED');

    expect(log.query({ limit: 50, includeStatic: true })).toHaveLength(3);
    expect(log.query({ limit: 50, failedOnly: true })).toHaveLength(2);
    expect(log.query({ limit: 50, filter: 'FEED' })).toHaveLength(1);
  });
});
