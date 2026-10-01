// Diagnostics-only MCP probe. Native MCP execution is handled entirely by
// pi's createMcpExtension (see index.ts) — this module exists only to
// populate MsgMcpStatus for the renderer's McpStatusBadge, since pi's public
// API exposes no live connection-status hook. It connects to each server
// independently, lists tools, and
// disconnects — a deliberate, isolated duplication of pi's own connection,
// purely for status. Delete this file if/when pi exposes a status hook.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpServerConfig } from '../agent-runtime/pi/protocol';
import { createLogger } from '../../shared/sub-logger';
import { withTimeout } from '../../shared/with-timeout';
import { MCP_CONNECT_CEILING_MS, MCP_POOL_BUDGET_MS } from '../../shared/timeouts';

const log = createLogger('mcp');

export interface McpServerDiagnostic {
  slug: string;
  transport: McpServerConfig['transport'];
  ok: boolean;
  toolCount?: number;
  error?: string;
  /** Set when `ok` is false for a structural reason rather than a transient
   *  connect failure — lets the UI show "unsupported" instead of "failed". */
  reason?: 'unsupported-transport';
}

export interface ProbeMcpOptions {
  connectTimeoutMs?: number;
  totalBudgetMs?: number;
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

function buildTransport(cfg: McpServerConfig): Transport {
  if (cfg.transport === 'stdio') {
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: stdioEnv(cfg.env),
      // Short-lived probe connection — pi's own connection (via
      // createMcpExtension) owns the server's real stderr logging.
      stderr: 'ignore',
    });
  }
  const url = new URL(cfg.url);
  const requestInit = cfg.headers ? { headers: cfg.headers } : undefined;
  if (cfg.transport === 'sse') {
    return new SSEClientTransport(url, requestInit ? { requestInit } : undefined);
  }
  return new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined);
}

async function probeOne(
  cfg: McpServerConfig,
  connectTimeoutMs: number,
): Promise<McpServerDiagnostic> {
  const client = new Client(
    { name: 'minimalist-agent-probe', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = buildTransport(cfg);
  try {
    await withTimeout(client.connect(transport), connectTimeoutMs, `mcp ${cfg.slug} connect`);
    const listed = await withTimeout(
      client.listTools(),
      connectTimeoutMs,
      `mcp ${cfg.slug} listTools`,
    );
    return {
      slug: cfg.slug,
      transport: cfg.transport,
      ok: true,
      toolCount: (listed.tools ?? []).length,
    };
  } finally {
    await client.close().catch((e) => log.debug(`Error closing MCP probe client: ${errMsg(e)}`));
  }
}

/**
 * A config this probe must not attempt a real connection for, with the
 * diagnostic to report instead.
 *
 * - `sse`: buildLoadedMcpConfig (mcp-native-config.ts) already drops `sse`
 *   servers before they reach createMcpExtension, so no `mcp__*` tools will
 *   ever be registered for one — probing it for real would let a reachable
 *   sse endpoint report "ready" for a server that can never actually work.
 * - `auth.provider` (http): the probe has no access to the provider's
 *   current token (that resolution lives inside pi's native MCP runtime), so
 *   an unauthenticated request would fail with 401 regardless of whether the
 *   real, token-bearing connection pi makes at tool-call time would succeed.
 *   Reported as unverified-but-optimistic instead of a false failure — the
 *   same "ok: true, no toolCount" shape the UI already uses for a server
 *   that simply hasn't connected yet this session.
 */
function shortCircuit(cfg: McpServerConfig): McpServerDiagnostic | undefined {
  if (cfg.transport === 'sse') {
    return {
      slug: cfg.slug,
      transport: cfg.transport,
      ok: false,
      reason: 'unsupported-transport',
      error: "pi's native MCP integration has no sse transport; this server cannot register tools.",
    };
  }
  if (cfg.transport !== 'stdio' && cfg.auth) {
    return { slug: cfg.slug, transport: cfg.transport, ok: true };
  }
  return undefined;
}

/** Probes every configured server in bounded parallel; never executes a
 *  tool or keeps a connection open past this call, and always resolves
 *  (never rejects) so a hung/misconfigured server can't block session boot. */
export async function probeMcpServers(
  configs: McpServerConfig[] | undefined,
  opts: ProbeMcpOptions = {},
): Promise<McpServerDiagnostic[]> {
  if (!configs || configs.length === 0) return [];

  const connectTimeoutMs = opts.connectTimeoutMs ?? MCP_CONNECT_CEILING_MS;
  const totalBudgetMs = opts.totalBudgetMs ?? MCP_POOL_BUDGET_MS;

  const toProbe = configs.filter((cfg) => shortCircuit(cfg) === undefined);
  log.info(`Probing ${toProbe.length} MCP server(s) for status…`);

  const settled = await withTimeout(
    Promise.allSettled(toProbe.map((cfg) => probeOne(cfg, connectTimeoutMs))),
    totalBudgetMs,
    'mcp probe pool',
  ).catch((e) => {
    log.warn(`MCP probe pool exceeded ${totalBudgetMs}ms budget: ${errMsg(e)}.`);
    return [] as PromiseSettledResult<McpServerDiagnostic>[];
  });

  let probedIndex = 0;
  return configs.map((cfg) => {
    const skipped = shortCircuit(cfg);
    if (skipped) return skipped;

    const outcome = settled[probedIndex++];
    if (!outcome) {
      return {
        slug: cfg.slug,
        transport: cfg.transport,
        ok: false,
        error: 'probe exceeded global budget',
      };
    }
    if (outcome.status === 'fulfilled') {
      log.info(`MCP ${cfg.slug}: ${outcome.value.toolCount ?? 0} tool(s)`);
      return outcome.value;
    }
    const error = errMsg(outcome.reason);
    log.warn(`MCP ${cfg.slug} probe failed: ${error}`);
    return { slug: cfg.slug, transport: cfg.transport, ok: false, error };
  });
}
