// SSRF guard for the agent's outbound HTTP tools (`web_fetch` / `web_search`).
//
// These tools run in the pi-server subprocess at full Node privilege and hand
// the response body back to the model. Without filtering, a prompt-injected
// page could steer the agent into fetching internal-only endpoints and reading
// the result back — classic read-back SSRF. The highest-value target is the
// cloud metadata service at 169.254.169.254 (instance credentials), followed
// by loopback/RFC1918 services and `*.internal` hosts.
//
// Defense (standard, layered):
//   1. Scheme allowlist (http/https only) + reject embedded credentials.
//   2. Resolve every DNS record and reject if ANY resolved IP is private,
//      loopback, link-local, metadata, CGNAT, multicast, or otherwise
//      non-public — including IPv4-mapped / -compatible / NAT64 IPv6 forms.
//   3. Pin the socket to a vetted IP via a custom `lookup` so the address that
//      gets connected is the same one we validated — closing the DNS-rebinding
//      TOCTOU window (a hostname that passes validation then re-resolves to an
//      internal IP at connect time).
//   4. Follow redirects manually, re-running (1)+(2)+(3) on every hop, with a
//      hard hop cap. `redirect: 'follow'` would otherwise sail straight to an
//      internal `Location:` after a public first hop.
//
// This module is pi-server-safe: no electron imports, logs via sub-logger.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createLogger } from '../../shared/sub-logger';

const log = createLogger('ssrf-guard');

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/* ---- IPv4 classification ------------------------------------------------ */

// [networkAddress, prefixLen, humanLabel]. Any address inside one of these is
// refused. Covers RFC 1918 private space, loopback, link-local (cloud IMDS),
// CGNAT, the unspecified/this-network block, documentation/benchmark ranges,
// multicast, and the reserved/future + broadcast block.
const V4_BLOCKS: ReadonlyArray<readonly [string, number, string]> = [
  ['0.0.0.0', 8, 'unspecified / this-network'],
  ['10.0.0.0', 8, 'private (RFC1918)'],
  ['100.64.0.0', 10, 'carrier-grade NAT (RFC6598)'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local (incl. cloud metadata 169.254.169.254)'],
  ['172.16.0.0', 12, 'private (RFC1918)'],
  ['192.0.0.0', 24, 'IETF protocol assignments'],
  ['192.0.2.0', 24, 'documentation (TEST-NET-1)'],
  ['192.88.99.0', 24, '6to4 relay anycast'],
  ['192.168.0.0', 16, 'private (RFC1918)'],
  ['198.18.0.0', 15, 'benchmarking (RFC2544)'],
  ['198.51.100.0', 24, 'documentation (TEST-NET-2)'],
  ['203.0.113.0', 24, 'documentation (TEST-NET-3)'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved / future (incl. 255.255.255.255 broadcast)'],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function describeBlockedV4(ip: string): string | null {
  const addr = ipv4ToInt(ip);
  if (addr === null) return 'malformed IPv4 address';
  for (const [base, prefix, label] of V4_BLOCKS) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((addr & mask) === (baseInt & mask)) return label;
  }
  return null;
}

/* ---- IPv6 classification ------------------------------------------------ */

// Parse any textual IPv6 (including `::` compression and an embedded dotted
// IPv4 tail) into a 128-bit BigInt. Returns null if malformed.
function ipv6ToBigInt(ip: string): bigint | null {
  let text = ip;

  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1) → convert to two hextets.
  const v4Match = text.match(/(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) {
    const v4 = ipv4ToInt(v4Match[2]);
    if (v4 === null) return null;
    const hi = (v4 >>> 16) & 0xffff;
    const lo = v4 & 0xffff;
    text = `${v4Match[1]}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups = segment.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (head === null || tail === null) return null;

  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const g of groups) value = (value << 16n) | BigInt(g);
  return value;
}

const V6_MAPPED_PREFIX = 0xffffn; // ::ffff:0:0/96 → IPv4-mapped (top 96 bits)
const NAT64_HIGH96 = 0x0064ff9bn << 64n; // 64:ff9b::/96 (top 96 bits)

function describeBlockedV6(ip: string): string | null {
  const value = ipv6ToBigInt(ip);
  if (value === null) return 'malformed IPv6 address';

  const low32 = Number(value & 0xffffffffn) >>> 0;
  const high96 = value >> 32n;

  // ::ffff:a.b.c.d (IPv4-mapped) and 64:ff9b::a.b.c.d (NAT64) really reach the
  // embedded IPv4 host — classify by that address.
  if (high96 === V6_MAPPED_PREFIX || high96 === NAT64_HIGH96) {
    return describeBlockedV4(intToIpv4(low32));
  }
  // ::/96 IPv4-compatible (deprecated) — but reserve ::/128 and ::1/128 below.
  if (high96 === 0n && value > 1n) {
    return describeBlockedV4(intToIpv4(low32));
  }

  if (value === 0n) return 'unspecified (::)';
  if (value === 1n) return 'loopback (::1)';

  const firstHextet = Number(value >> 112n);
  if ((firstHextet & 0xffc0) === 0xfe80) return 'link-local (fe80::/10)';
  if ((firstHextet & 0xfe00) === 0xfc00) return 'unique-local (fc00::/7)';
  if ((firstHextet & 0xff00) === 0xff00) return 'multicast (ff00::/8)';
  if (firstHextet === 0x2001 && Number((value >> 96n) & 0xffffn) === 0x0db8) {
    return 'documentation (2001:db8::/32)';
  }
  return null;
}

function intToIpv4(value: number): string {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join('.');
}

/**
 * Returns a human-readable reason if `ip` is a non-public address that the
 * agent must not reach, or `null` if it is a routable public address.
 */
export function describeBlockedIp(ip: string): string | null {
  const family = net.isIP(ip);
  if (family === 4) return describeBlockedV4(ip);
  if (family === 6) return describeBlockedV6(ip);
  return 'not a valid IP address';
}

/* ---- URL-level checks --------------------------------------------------- */

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Validate scheme + credentials and, for IP-literal hosts, the address itself
 * (a literal never goes through `lookup`, so it must be checked here). Throws
 * `SsrfError` on rejection. Returns the parsed URL.
 */
export function assertAllowedUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError(`invalid URL: ${rawUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError(`blocked URL scheme "${u.protocol}" (only http/https allowed)`);
  }
  if (u.username || u.password) {
    throw new SsrfError('credentials embedded in URL are not allowed');
  }
  const host = stripBrackets(u.hostname);
  if (net.isIP(host)) {
    const reason = describeBlockedIp(host);
    if (reason) throw new SsrfError(`blocked address ${u.hostname}: ${reason}`);
  }
  return u;
}

/* ---- DNS-pinning lookup ------------------------------------------------- */

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * A `dns.lookup`-compatible function for `net.connect`. It resolves all
 * records, rejects the whole connection if ANY of them is non-public, and
 * hands the socket only vetted addresses. Because this is the resolution the
 * socket actually connects with, a hostname cannot pass validation and then
 * rebind to an internal IP before connect.
 */
const pinningLookup: LookupFunction = (
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
): void => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    if (!addresses || addresses.length === 0) {
      callback(new SsrfError(`DNS returned no records for ${hostname}`), '', 0);
      return;
    }
    for (const a of addresses) {
      const reason = describeBlockedIp(a.address);
      if (reason) {
        log.warn(`blocked ${hostname} → ${a.address}: ${reason}`);
        callback(
          new SsrfError(`blocked address ${a.address} for ${hostname}: ${reason}`),
          '',
          0,
        );
        return;
      }
    }
    const wantAll = typeof options === 'object' && options.all === true;
    if (wantAll) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

/* ---- safe GET ----------------------------------------------------------- */

export interface SafeGetOptions {
  headers: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
}

export interface SafeResponse {
  status: number;
  statusText: string;
  finalUrl: string;
  contentType: string;
  body: Buffer;
  truncatedBytes: boolean;
}

type OnceResult =
  | { kind: 'redirect'; location: string }
  | { kind: 'response'; res: SafeResponse };

function decompressStream(res: http.IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function requestOnce(current: URL, opts: SafeGetOptions): Promise<OnceResult> {
  return new Promise<OnceResult>((resolve, reject) => {
    const mod = current.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      fn();
    };

    const req = mod.request(
      current,
      { method: 'GET', headers: opts.headers, lookup: pinningLookup },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume(); // drain so the socket can be reused/closed cleanly
          finish(() => resolve({ kind: 'redirect', location }));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        const stream = decompressStream(res);

        stream.on('data', (chunk: Buffer) => {
          if (truncated) return;
          if (total + chunk.length > opts.maxBytes) {
            chunks.push(chunk.subarray(0, opts.maxBytes - total));
            truncated = true;
            // Settle *before* destroying so the resulting req/stream 'error'
            // (ECONNRESET) can't race us into the reject path.
            finish(() =>
              resolve({
                kind: 'response',
                res: {
                  status,
                  statusText: res.statusMessage ?? '',
                  finalUrl: current.toString(),
                  contentType: String(res.headers['content-type'] ?? '').toLowerCase(),
                  body: Buffer.concat(chunks),
                  truncatedBytes: true,
                },
              }),
            );
            req.destroy();
            return;
          }
          chunks.push(chunk);
          total += chunk.length;
        });
        stream.on('end', () =>
          finish(() =>
            resolve({
              kind: 'response',
              res: {
                status,
                statusText: res.statusMessage ?? '',
                finalUrl: current.toString(),
                contentType: String(res.headers['content-type'] ?? '').toLowerCase(),
                body: Buffer.concat(chunks),
                truncatedBytes: false,
              },
            }),
          ),
        );
        stream.on('error', (e) => finish(() => reject(e)));
      },
    );

    const timer = setTimeout(
      () => finish(() => {
        req.destroy();
        reject(new Error(`request timed out after ${opts.timeoutMs}ms`));
      }),
      opts.timeoutMs,
    );
    const onAbort = () =>
      finish(() => {
        req.destroy();
        reject(new Error('request aborted'));
      });
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    req.on('error', (e) => finish(() => reject(e)));
    req.end();
  });
}

/**
 * SSRF-safe HTTP GET: validates the URL and every redirect hop, pins each
 * connection to a vetted public IP, caps body size, and decompresses common
 * encodings. Throws `SsrfError` for blocked targets and `Error` for transport
 * failures.
 */
export async function safeHttpGet(
  rawUrl: string,
  opts: SafeGetOptions,
): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = assertAllowedUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await requestOnce(current, opts);
    if (result.kind === 'response') return result.res;

    // Resolve the redirect target relative to the current URL, then re-validate
    // scheme/host (the pinning lookup re-validates the resolved IP on connect).
    let next: URL;
    try {
      next = new URL(result.location, current);
    } catch {
      throw new SsrfError(`invalid redirect target "${result.location}"`);
    }
    current = assertAllowedUrl(next.toString());
  }
  throw new SsrfError(`too many redirects (> ${maxRedirects})`);
}
