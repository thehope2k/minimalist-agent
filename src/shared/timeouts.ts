function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Global HTTP idle timeout (headersTimeout/bodyTimeout) for the pi-server
 *  subprocess's undici dispatcher — bounds every fetch it makes. */
export const HTTP_IDLE_TIMEOUT_MS = envMs('MA_HTTP_IDLE_TIMEOUT_MS', 60_000);

/** Ceiling for a single OAuth refresh attempt in main's `guardedRefresh`. */
export const AUTH_REFRESH_CEILING_MS = envMs('MA_AUTH_REFRESH_TIMEOUT_MS', 20_000);

/** How long pi-server waits for main's `auth_refresh_result` before falling
 *  back to its own local refresh attempt. Kept above `AUTH_REFRESH_CEILING_MS`
 *  so main's attempt can finish or time out first. */
export const AUTH_REFRESH_MAIN_ROUNDTRIP_MS = AUTH_REFRESH_CEILING_MS + 5_000;

/** Ceiling for a single mini_completion / llm_query one-shot call. */
export const MINI_COMPLETION_CEILING_MS = envMs('MA_MINI_COMPLETION_TIMEOUT_MS', 45_000);

/** Ceiling for a single MCP server's connect + listTools handshake. */
export const MCP_CONNECT_CEILING_MS = envMs('MA_MCP_CONNECT_TIMEOUT_MS', 15_000);

/** Ceiling for a single MCP tool invocation. */
export const MCP_CALL_CEILING_MS = envMs('MA_MCP_CALL_TIMEOUT_MS', 120_000);

/** Ceiling for the whole MCP server pool to come up; never blocks session boot past this. */
export const MCP_POOL_BUDGET_MS = envMs('MA_MCP_POOL_TIMEOUT_MS', 30_000);

/** Auto-compaction silence ceiling before force-aborting. */
export const AUTO_COMPACTION_TIMEOUT_MS = envMs('MA_COMPACTION_TIMEOUT_MS', 60_000);

/** Force-recover a subprocess that has produced zero stdout for this long. */
export const TURN_IDLE_TIMEOUT_MS = envMs('MA_TURN_IDLE_TIMEOUT_MS', 5 * 60 * 1000);

/** Sweep interval for the turn-idle watchdog. */
export const WATCHDOG_SWEEP_MS = 15_000;
