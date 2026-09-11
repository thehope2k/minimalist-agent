import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createLogger } from '../logger';
import { codeMieApiBase, codeMieCookieHeader, isLoopbackAddress } from './shared';

const log = createLogger('codemie-proxy');
const EXCLUDED_REQUEST_HEADERS = new Set(['authorization', 'connection', 'cookie', 'host']);
const EXCLUDED_RESPONSE_HEADERS = new Set(['connection', 'transfer-encoding']);

type ActiveProxy = { config: CodeMieProxyConfig; server: Server; url: string };

export interface CodeMieProxyConfig {
  targetBaseUrl: string;
  cookies: Record<string, string>;
  project?: string;
  integrationId?: string;
}

const proxies = new Map<string, ActiveProxy>();

function requestHeaders(source: IncomingHttpHeaders, config: CodeMieProxyConfig): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (typeof value === 'string' && !EXCLUDED_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  }
  headers.set('Cookie', codeMieCookieHeader(config.cookies));
  headers.set('X-CodeMie-Request-ID', randomUUID());
  headers.set('X-CodeMie-Client', 'minimalist-agent');
  if (config.project) headers.set('X-CodeMie-Project', config.project);
  if (config.integrationId) headers.set('X-CodeMie-Integration', config.integrationId);
  return headers;
}

function responseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries([...headers].filter(([name]) => !EXCLUDED_RESPONSE_HEADERS.has(name.toLowerCase())));
}

function requestBody(request: IncomingMessage): ReadableStream | undefined {
  return request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : Readable.toWeb(request) as ReadableStream;
}

async function forwardRequest(slug: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const proxy = proxies.get(slug);
  if (!proxy) throw new Error(`CodeMie proxy "${slug}" is unavailable.`);
  const upstream = await fetch(`${proxy.config.targetBaseUrl.replace(/\/+$/, '')}${request.url}`, {
    method: request.method,
    headers: requestHeaders(request.headers, proxy.config),
    body: requestBody(request),
    duplex: 'half',
  } as RequestInit);
  response.writeHead(upstream.status, responseHeaders(upstream.headers));
  if (!upstream.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body as never).pipe(response);
}

function createProxyServer(slug: string): Server {
  return createServer((request, response) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      response.writeHead(403).end();
      return;
    }
    void forwardRequest(slug, request, response).catch((error) => {
      log.warn('CodeMie proxy request failed:', error);
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'CodeMie gateway request failed.' } }));
    });
  });
}

async function startProxy(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start CodeMie gateway.');
  return `http://127.0.0.1:${address.port}`;
}

export async function ensureCodeMieProxy(slug: string, config: CodeMieProxyConfig): Promise<string> {
  const normalizedConfig = { ...config, targetBaseUrl: codeMieApiBase(config.targetBaseUrl) };
  const existing = proxies.get(slug);
  if (existing) {
    existing.config = normalizedConfig;
    return existing.url;
  }
  const server = createProxyServer(slug);
  const url = await startProxy(server);
  proxies.set(slug, { config: normalizedConfig, server, url });
  return url;
}

export function stopCodeMieProxies(): void {
  for (const { server } of proxies.values()) server.close();
  proxies.clear();
}
