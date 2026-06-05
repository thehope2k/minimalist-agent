// Web tools for the Pi subprocess. `pi-coding-agent` ships file/shell
// tools but not web ones, so we define them in-process using Pi's
// `defineTool` + TypeBox schema.
//
// Tools:
//   - `web_fetch`: HTTP GET, strip HTML to readable text, truncate
//   - `web_search`: DuckDuckGo HTML scrape (no API key required)

import { Type } from 'typebox';
import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { safeHttpGet, SsrfError, type SafeResponse } from './ssrf-guard';

// Pi-server runs as a Node-mode subprocess (ELECTRON_RUN_AS_NODE=1), so
// importing `app` from 'electron' fails — the module resolves to the binary
// path and has no named exports. The parent process passes the app version
// via env instead.
const APP_VERSION = process.env.MINIMALIST_AGENT_VERSION ?? '0.0.0';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 1_500_000;
const MAX_RESULT_CHARS = 60_000;

const FETCH_HEADERS = {
  // Identify as a friendly browser to coax HTML out of paranoid sites.
  'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) MinimalistAgent/${APP_VERSION} Safari/537.36`,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
} as const;

/* ---- HTML → readable text ----------------------------------------- */

function stripHtml(html: string): string {
  // Drop scripts, styles, noscript, head — they're never content.
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ');
  // Block-level elements → newline so the LLM sees structure.
  s = s.replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|header|footer|main|nav|br)>/gi, '\n');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  // Strip every remaining tag.
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode the handful of entities that actually matter.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
  // Collapse whitespace; preserve paragraph breaks.
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function clamp(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max) + `\n\n[... truncated; ${text.length - max} more chars]`, truncated: true };
}

async function fetchSafe(url: string, signal?: AbortSignal): Promise<SafeResponse> {
  return safeHttpGet(url, {
    headers: { ...FETCH_HEADERS },
    signal,
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_BYTES,
  });
}

/* ---- web_fetch ---------------------------------------------------- */

const webFetchSchema = Type.Object({
  url: Type.String({ description: 'Absolute URL to fetch (http/https).' }),
});

export function createPiWebFetchTool(): ToolDefinition<typeof webFetchSchema, unknown> {
  return defineTool({
    name: 'web_fetch',
    label: 'Fetch web page',
    description:
      'Fetch a web page or document by URL and return its readable text. ' +
      'HTML is stripped to plain prose; JSON/text are returned as-is. Output is truncated to roughly 60k chars.',
    promptSnippet:
      'web_fetch: GET a URL and return readable text. Use for docs/articles/specs.',
    parameters: webFetchSchema,
    execute: async (_toolCallId, params, signal) => {
      const url = String(params.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `web_fetch: invalid URL: ${url}` }],
        } as never;
      }
      try {
        const res = await fetchSafe(url, signal);
        if (res.status < 200 || res.status >= 300) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `web_fetch: ${res.status} ${res.statusText} for ${url}`,
              },
            ],
          } as never;
        }
        const ct = res.contentType;
        const buf = res.body;
        const truncatedBytes = res.truncatedBytes;
        const slice = buf;

        let body: string;
        if (ct.includes('text/html') || ct.includes('application/xhtml')) {
          body = stripHtml(slice.toString('utf-8'));
        } else if (
          ct.includes('json') ||
          ct.includes('text/') ||
          ct.includes('application/xml') ||
          ct.includes('javascript')
        ) {
          body = slice.toString('utf-8');
        } else {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `web_fetch: unsupported content-type "${ct || 'unknown'}" (only text/HTML/JSON supported).`,
              },
            ],
          } as never;
        }

        const { text, truncated } = clamp(body, MAX_RESULT_CHARS);
        const header = `URL: ${res.finalUrl}\nStatus: ${res.status}\nContent-Type: ${ct || 'unknown'}\n${truncatedBytes ? `Note: response body exceeded ${MAX_BYTES} bytes; truncated.\n` : ''}${truncated ? '' : ''}\n---\n`;
        return {
          isError: false,
          content: [{ type: 'text', text: header + text }],
        } as never;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        const label = e instanceof SsrfError ? 'web_fetch blocked' : 'web_fetch failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `${label} for ${url}: ${m}` }],
        } as never;
      }
    },
  }) as ToolDefinition<typeof webFetchSchema, unknown>;
}

/* ---- web_search (DuckDuckGo HTML scrape) -------------------------- */

const webSearchSchema = Type.Object({
  query: Type.String({ description: 'Search query.' }),
  count: Type.Optional(Type.Number({ description: 'Max results (default 8, max 15).' })),
});

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function parseDuckDuckGoHtml(html: string, max: number): SearchHit[] {
  // DuckDuckGo's html.duckduckgo.com layout: each result is a <div class="result">
  // containing <a class="result__a"> for title+url and <a class="result__snippet">
  // for the body. We grep with a tolerant regex — DDG occasionally tweaks markup
  // but these classes have been stable for years.
  const results: SearchHit[] = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawUrl = decodeURIComponent(
      m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&rut=.*$/, ''),
    );
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const title = stripHtml(m[2]).trim();
    const snippet = stripHtml(m[3]).trim();
    if (title && url) results.push({ title, url, snippet });
    if (results.length >= max) break;
  }
  return results;
}

export function createPiWebSearchTool(): ToolDefinition<typeof webSearchSchema, unknown> {
  return defineTool({
    name: 'web_search',
    label: 'Web search',
    description:
      'Search the public web. Returns a list of titles, URLs, and snippets. Use web_fetch on a returned URL to read the full content.',
    promptSnippet: 'web_search: search the web for current information.',
    parameters: webSearchSchema,
    execute: async (_toolCallId, params, signal) => {
      const query = String(params.query ?? '').trim();
      const count = Math.max(1, Math.min(15, Number(params.count ?? 8)));
      if (!query) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'web_search: empty query.' }],
        } as never;
      }
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      try {
        const res = await fetchSafe(url, signal);
        if (res.status < 200 || res.status >= 300) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `web_search: DuckDuckGo returned ${res.status} ${res.statusText}.`,
              },
            ],
          } as never;
        }
        const html = res.body.toString('utf-8');
        const hits = parseDuckDuckGoHtml(html, count);
        if (hits.length === 0) {
          return {
            isError: false,
            content: [{ type: 'text', text: `No results for "${query}".` }],
          } as never;
        }
        const formatted = hits
          .map(
            (h, i) =>
              `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet.slice(0, 300)}`,
          )
          .join('\n\n');
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Top ${hits.length} results for "${query}":\n\n${formatted}`,
            },
          ],
        } as never;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        const label = e instanceof SsrfError ? 'web_search blocked' : 'web_search failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `${label}: ${m}` }],
        } as never;
      }
    },
  }) as ToolDefinition<typeof webSearchSchema, unknown>;
}
