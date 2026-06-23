// MCP-backed extension support for the Pi subprocess.
//
// The Pi SDK has no native MCP integration (unlike the Claude Agent SDK's
// `mcpServers` option) — it only accepts `customTools: ToolDefinition[]`. This
// module bridges the gap: for each resolved MCP server config (handed down from
// main via `MsgInit.mcpServers`, secrets already decrypted), it spawns/connects
// an MCP client, lists the server's tools, and adapts each into a Pi
// `ToolDefinition` named `mcp__<slug>__<tool>`.
//
// Robustness is the whole point here — an MCP server is an external process we
// don't control:
//   - Per-server connect + list is wrapped in a timeout race, so a hung server
//     can't stall session boot.
//   - Every server is isolated in its own try/catch; one failure skips that
//     server's tools and is logged, never throwing.
//   - Connects run in bounded parallel under a global budget.
//   - Each `callTool` is itself timeout-bounded and maps failures to an
//     `isError` tool result instead of crashing the turn.
//
// Lifecycle: the returned `clients` must be closed on shutdown (see index.ts).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { PiMcpServerConfig } from '../agent/backends/pi/protocol';
import { createLogger } from '../../shared/sub-logger';

const log = createLogger('pi-mcp');

/** Default ceiling for a single server's connect + listTools handshake. */
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
/** Default ceiling for a single tool invocation. */
const DEFAULT_CALL_TIMEOUT_MS = 120_000;
/** Default ceiling for the whole pool to come up; never block boot past this. */
const DEFAULT_TOTAL_BUDGET_MS = 30_000;

export interface ConnectMcpOptions {
  connectTimeoutMs?: number;
  callTimeoutMs?: number;
  totalBudgetMs?: number;
}

/** Per-server outcome, surfaced to main for status/diagnostics. */
export interface McpServerDiagnostic {
  slug: string;
  transport: PiMcpServerConfig['transport'];
  ok: boolean;
  /** Tool count on success. */
  toolCount?: number;
  /** Failure reason on error. */
  error?: string;
}

export interface ConnectMcpResult {
  /** Adapted Pi tools, ready to push into `customTools`. */
  tools: ToolDefinition<any, any, any>[];
  /** Live clients to close on shutdown. */
  clients: Client[];
  /** Per-server outcomes for status surfacing. */
  diagnostics: McpServerDiagnostic[];
}

/* ============================================================ */
/*  Helpers                                                      */
/* ============================================================ */

/** Reject after `ms`, so a hung transport can't block forever. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Build the stdio environment. The MCP SDK *replaces* (does not merge) the
 * child env when `env` is provided, so we must fold in a minimal safe subset
 * of our own env (PATH, HOME, …) or the spawned command won't be found.
 */
function stdioEnv(resolved?: Record<string, string>): Record<string, string> | undefined {
  if (!resolved) return undefined;
  const base: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TMPDIR', 'SystemRoot', 'APPDATA']) {
    const v = process.env[key];
    if (v != null) base[key] = v;
  }
  return { ...base, ...resolved };
}

function buildTransport(cfg: PiMcpServerConfig): Transport {
  if (cfg.transport === 'stdio') {
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: stdioEnv(cfg.env),
      // 'inherit' routes the server's stderr to this subprocess's fd 2, which
      // the parent pipes into the main log. It never touches fd 1 (the JSONL
      // protocol), and avoids the unbounded in-memory buffering that 'pipe'
      // incurs when the stderr PassThrough is never drained.
      stderr: 'inherit',
    });
  }
  const url = new URL(cfg.url);
  const requestInit = cfg.headers ? { headers: cfg.headers } : undefined;
  if (cfg.transport === 'sse') {
    // Streamable HTTP supersedes the SSE transport in the MCP spec; SSE is kept
    // only for servers that haven't migrated, and is selected solely by an
    // explicit `transport: 'sse'` config. Prefer 'http' for everything else.
    return new SSEClientTransport(url, requestInit ? { requestInit } : undefined);
  }
  return new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined);
}

/* ============================================================ */
/*  MCP content → Pi tool result                                */
/* ============================================================ */

interface McpContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [k: string]: unknown;
}

/**
 * Map an MCP CallToolResult into Pi's `AgentToolResult` shape. Text blocks pass
 * through; non-text blocks (image/audio/resource) are rendered as a compact
 * text placeholder so the model still sees *something* without us depending on
 * Pi's richer content union (keeps the adapter resilient across SDK versions).
 */
function mapToolResult(
  raw: unknown,
): { isError: boolean; content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> } {
  const result = (raw ?? {}) as { content?: McpContentBlock[]; isError?: boolean };
  const blocks = Array.isArray(result.content) ? result.content : [];

  const content = blocks.map((b) => {
    if (b.type === 'text' && typeof b.text === 'string') {
      return { type: 'text' as const, text: b.text };
    }
    if (b.type === 'image' || b.type === 'audio') {
      return { type: 'text' as const, text: `[${b.type}${b.mimeType ? ` ${b.mimeType}` : ''} content omitted]` };
    }
    if (b.type === 'resource') {
      return { type: 'text' as const, text: `[resource: ${JSON.stringify(b.resource ?? b)}]` };
    }
    return { type: 'text' as const, text: typeof b.text === 'string' ? b.text : JSON.stringify(b) };
  });

  if (content.length === 0) {
    content.push({ type: 'text' as const, text: result.isError ? 'Tool returned an error with no content.' : 'Tool returned no content.' });
  }

  return { isError: result.isError === true, content, details: {} };
}

/* ============================================================ */
/*  Adapt one server's tools                                    */
/* ============================================================ */

function adaptTools(
  slug: string,
  client: Client,
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>,
  callTimeoutMs: number,
): ToolDefinition<any, any, any>[] {
  return tools.map((t) => {
    const qualifiedName = `mcp__${slug}__${t.name}`;
    const parameters =
      t.inputSchema && typeof t.inputSchema === 'object'
        ? (t.inputSchema as any)
        : { type: 'object', properties: {} };

    return {
      name: qualifiedName,
      label: `${slug}: ${t.name}`,
      description: t.description ?? `MCP tool ${t.name} from ${slug}`,
      parameters,
      // MCP servers ship raw JSON Schema; pass args through untouched so Pi's
      // TypeBox validator doesn't reject loosely-typed-but-valid inputs.
      prepareArguments: (args: unknown) => args as any,
      execute: async (_toolCallId: string, params: unknown, signal?: AbortSignal) => {
        try {
          const raw = await withTimeout(
            client.callTool(
              { name: t.name, arguments: (params ?? {}) as Record<string, unknown> },
              undefined,
              { timeout: callTimeoutMs, signal },
            ),
            callTimeoutMs,
            `mcp ${qualifiedName}`,
          );
          return mapToolResult(raw);
        } catch (e) {
          log.warn(`MCP tool ${qualifiedName} failed: ${errMsg(e)}`);
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `MCP tool error: ${errMsg(e)}` }],
            details: {},
          };
        }
      },
    } as ToolDefinition<any, any, any>;
  });
}

/* ============================================================ */
/*  Public: connect the whole pool                              */
/* ============================================================ */

async function connectOne(
  cfg: PiMcpServerConfig,
  connectTimeoutMs: number,
  callTimeoutMs: number,
): Promise<{ client: Client; tools: ToolDefinition<any, any, any>[]; diagnostic: McpServerDiagnostic }> {
  const client = new Client(
    { name: 'minimalist-agent', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = buildTransport(cfg);

  await withTimeout(client.connect(transport), connectTimeoutMs, `mcp ${cfg.slug} connect`);
  const listed = await withTimeout(client.listTools(), connectTimeoutMs, `mcp ${cfg.slug} listTools`);

  const tools = adaptTools(cfg.slug, client, (listed.tools ?? []) as any, callTimeoutMs);
  return {
    client,
    tools,
    diagnostic: { slug: cfg.slug, transport: cfg.transport, ok: true, toolCount: tools.length },
  };
}

/**
 * Connect every configured MCP server in bounded parallel and return their
 * adapted tools. Failures are isolated per server; the call always resolves
 * (never rejects) so it can't break session boot. A global budget caps total
 * wait time — servers slower than the budget are abandoned (their partial
 * client is closed) and reported as failed.
 */
export async function connectMcpServers(
  configs: PiMcpServerConfig[] | undefined,
  opts: ConnectMcpOptions = {},
): Promise<ConnectMcpResult> {
  const result: ConnectMcpResult = { tools: [], clients: [], diagnostics: [] };
  if (!configs || configs.length === 0) return result;

  const connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const callTimeoutMs = opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const totalBudgetMs = opts.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;

  log.info(`Connecting ${configs.length} MCP server(s)…`);

  const settled = await withTimeout(
    Promise.allSettled(
      configs.map((cfg) => connectOne(cfg, connectTimeoutMs, callTimeoutMs)),
    ),
    totalBudgetMs,
    'mcp pool',
  ).catch((e) => {
    // Global budget blown: degrade to "no MCP tools" rather than hanging boot.
    log.warn(`MCP pool exceeded ${totalBudgetMs}ms budget: ${errMsg(e)}. Continuing without late servers.`);
    return [] as PromiseSettledResult<Awaited<ReturnType<typeof connectOne>>>[];
  });

  configs.forEach((cfg, i) => {
    const outcome = settled[i];
    if (!outcome) {
      result.diagnostics.push({ slug: cfg.slug, transport: cfg.transport, ok: false, error: 'connect exceeded global budget' });
      return;
    }
    if (outcome.status === 'fulfilled') {
      result.clients.push(outcome.value.client);
      result.tools.push(...outcome.value.tools);
      result.diagnostics.push(outcome.value.diagnostic);
      log.info(`MCP ${cfg.slug}: ${outcome.value.tools.length} tool(s)`);
    } else {
      const error = errMsg(outcome.reason);
      result.diagnostics.push({ slug: cfg.slug, transport: cfg.transport, ok: false, error });
      log.warn(`MCP ${cfg.slug} failed to connect: ${error}`);
    }
  });

  return result;
}

/** Close every client, swallowing individual errors. */
export async function closeMcpClients(clients: Client[]): Promise<void> {
  await Promise.allSettled(
    clients.map(async (c) => {
      try {
        await c.close();
      } catch (e) {
        log.debug(`Error closing MCP client: ${errMsg(e)}`);
      }
    }),
  );
}
