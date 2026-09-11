// Build resolved MCP server configs for the agent runtime, drawing from
// enabled mcp-backed extensions. Resolves SecretRef env values from the
// secret store. Skips extensions whose required secrets aren't set or
// whose user-consent hasn't been granted.

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import type { LoadedExtension } from './types';
import { requiresConsent, resolveEnvValue } from './types';
import { loadAllExtensions } from './storage';
import { getSecret } from './secrets';
import { Paths } from '../storage/paths';

/* ---------- consent ---------- */

interface ConsentsFile {
  version: 1;
  granted: Record<string, true>;
}

/**
 * Consent is keyed off what's actually being trusted, so a config change
 * (new command, new secret-bearing env var) invalidates a prior grant
 * instead of silently carrying it over.
 */
function consentKey(ext: LoadedExtension): string {
  const { slug, config } = ext;
  const mcp = config.mcp;
  // Secret-bearing env var names are part of the trust surface even for an
  // MCP-backed extension: envFromBinding feeds them to the spawned server,
  // so a new one is a new credential flowing somewhere, not a no-op.
  const secretKeys = Object.entries(config.env ?? {})
    .filter(([, v]) => typeof v !== 'string')
    .map(([k]) => k)
    .sort()
    .join(',');

  if (mcp) {
    const mcpSig =
      mcp.transport === 'stdio'
        ? `stdio|${mcp.command} ${(mcp.args ?? []).join(' ')}`
        : `${mcp.transport}|${mcp.url}`;
    const sig = `${mcpSig}|env:${secretKeys}`;
    return `${slug}|${createHash('sha256').update(sig).digest('hex').slice(0, 16)}`;
  }
  return `${slug}|env|${createHash('sha256').update(secretKeys).digest('hex').slice(0, 16)}`;
}

function readConsents(): ConsentsFile {
  const path = Paths.extensionConsents();
  if (!existsSync(path)) return { version: 1, granted: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ConsentsFile;
    if (parsed.version === 1 && parsed.granted) return parsed;
  } catch {
    /* corrupt */
  }
  return { version: 1, granted: {} };
}

function writeConsents(file: ConsentsFile): void {
  writeFileSync(Paths.extensionConsents(), JSON.stringify(file, null, 2), 'utf-8');
}

export function hasConsent(ext: LoadedExtension): boolean {
  // Project-tier extensions are auto-consented — presence in .minimalist-agent/ IS consent.
  if (ext.scope === 'project') return true;
  // Neither an MCP server nor a credential: a guide, or a cli-bound
  // extension with only literal (non-secret) env values. No trust decision
  // to gate.
  if (!requiresConsent(ext.config)) return true;
  return readConsents().granted[consentKey(ext)] === true;
}

export function grantConsent(ext: LoadedExtension): void {
  if (!requiresConsent(ext.config)) return;
  const file = readConsents();
  file.granted[consentKey(ext)] = true;
  writeConsents(file);
}

export function revokeConsent(ext: LoadedExtension): void {
  if (!requiresConsent(ext.config)) return;
  const file = readConsents();
  delete file.granted[consentKey(ext)];
  writeConsents(file);
}

/* ---------- env resolution ---------- */

/**
 * Names of secrets declared in extension.env that are not yet set in the
 * secret store. Used by the UI to nudge the user before enabling.
 */
export function listMissingSecrets(ext: LoadedExtension): string[] {
  const env = ext.config.env;
  if (!env) return [];
  const missing: string[] = [];
  for (const [_name, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      const stored = getSecret(ext.slug, value.secret);
      if (!stored) missing.push(value.secret);
    }
  }
  return missing;
}

/** Names of all secret refs declared (whether or not they're set). */
export function listDeclaredSecrets(ext: LoadedExtension): string[] {
  const env = ext.config.env;
  if (!env) return [];
  const out: string[] = [];
  for (const value of Object.values(env)) {
    if (typeof value !== 'string') out.push(value.secret);
  }
  return out;
}

function resolveEnv(ext: LoadedExtension): Record<string, string> | null {
  const env = ext.config.env;
  if (!env) return undefined as unknown as Record<string, string> | null;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const resolved = resolveEnvValue(value, ext.scope, (key) => getSecret(ext.slug, key));
    if (resolved === null) return null; // missing secret — can't spawn safely
    if (resolved !== undefined) out[name] = resolved;
  }
  return out;
}

/* ---------- resolved, serializable configs ---------- */

/**
 * A fully-resolved MCP server config, safe to serialize across the
 * main→subprocess JSONL boundary. SecretRef env/headers are already
 * decrypted here, because the agent subprocess cannot read the secret store.
 *
 * Carries `slug` so the subprocess can namespace tools as `mcp__<slug>__<tool>`.
 */
export type ResolvedMcpServerConfig =
  | {
      slug: string;
      transport: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      slug: string;
      transport: 'http' | 'sse';
      url: string;
      headers?: Record<string, string>;
    };

function toResolvedConfig(ext: LoadedExtension): ResolvedMcpServerConfig | null {
  const mcp = ext.config.mcp;
  if (!mcp) return null;

  if (mcp.transport === 'stdio') {
    const cfg: ResolvedMcpServerConfig = {
      slug: ext.slug,
      transport: 'stdio',
      command: mcp.command,
      args: mcp.args,
    };
    if (mcp.envFromBinding) {
      const env = resolveEnv(ext);
      if (env === null) return null; // missing secret — can't spawn safely
      if (env) cfg.env = env;
    }
    return cfg;
  }

  return {
    slug: ext.slug,
    transport: mcp.transport,
    url: mcp.url,
    headers: mcp.headers,
  };
}

/**
 * Resolved MCP server configs for the agent runtime. Gated on enabled +
 * consented + secrets satisfied. Output is a flat, JSON-serializable array
 * with secrets already decrypted — ready to cross into the agent subprocess
 * via `MsgInit`.
 */
export function buildResolvedMcpServers(cwd?: string): ResolvedMcpServerConfig[] {
  const out: ResolvedMcpServerConfig[] = [];
  for (const ext of loadAllExtensions(cwd)) {
    if (!ext.config.mcp) continue;
    if (!hasConsent(ext)) continue;
    const cfg = toResolvedConfig(ext);
    if (cfg) out.push(cfg);
  }
  return out;
}

/* ---------- runtime connection status ---------- */

/**
 * Live MCP connection outcome reported by the agent subprocess, keyed by slug.
 * Distinct from the config-level status below: an extension can be fully
 * configured yet fail to connect (bad command, unreachable URL, server crash).
 */
interface RuntimeMcpStatus {
  ok: boolean;
  toolCount?: number;
  error?: string;
}
const runtimeMcpStatus = new Map<string, RuntimeMcpStatus>();

export function recordMcpStatus(
  servers: Array<{ slug: string; ok: boolean; toolCount?: number; error?: string }>,
): void {
  for (const s of servers) {
    runtimeMcpStatus.set(s.slug, { ok: s.ok, toolCount: s.toolCount, error: s.error });
  }
}

/**
 * Enumerates extensions that *would* be included in `buildResolvedMcpServers`
 * if their blockers were resolved — useful for diagnostics.
 */
export function listMcpExtensionsStatus(cwd?: string): Array<{
  slug: string;
  ok: boolean;
  reason?: 'missing-secrets' | 'no-consent' | 'connect-failed';
  toolCount?: number;
  error?: string;
}> {
  return loadAllExtensions(cwd)
    .filter((e) => e.config.mcp)
    .map((e) => {
      if (!hasConsent(e)) return { slug: e.slug, ok: false, reason: 'no-consent' as const };
      if (listMissingSecrets(e).length > 0)
        return { slug: e.slug, ok: false, reason: 'missing-secrets' as const };
      const runtime = runtimeMcpStatus.get(e.slug);
      if (runtime && !runtime.ok)
        return { slug: e.slug, ok: false, reason: 'connect-failed' as const, error: runtime.error };
      return { slug: e.slug, ok: true, toolCount: runtime?.toolCount };
    });
}
