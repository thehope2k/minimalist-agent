// Build the `mcpServers` config the Claude SDK expects, drawing from
// enabled mcp-backed extensions. Resolves SecretRef env values from the
// secret store. Skips extensions whose required secrets aren't set or
// whose user-consent hasn't been granted.

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import type { LoadedExtension, McpConfig } from './types';
import { isEnabled } from './types';
import { loadAllExtensions } from './storage';
import { getSecret } from './secrets';
import { Paths } from '../storage/paths';

export interface SdkStdioServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
export interface SdkHttpServerConfig {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}
export type SdkMcpServerConfig = SdkStdioServerConfig | SdkHttpServerConfig;

/* ---------- consent ---------- */

interface ConsentsFile {
  version: 1;
  granted: Record<string, true>;
}

function consentKey(slug: string, mcp: McpConfig): string {
  if (mcp.transport === 'stdio') {
    const sig = `${mcp.command} ${(mcp.args ?? []).join(' ')}`;
    return `${slug}|stdio|${createHash('sha256').update(sig).digest('hex').slice(0, 16)}`;
  }
  return `${slug}|${mcp.transport}|${mcp.url}`;
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
  if (!ext.config.mcp) return true;
  return readConsents().granted[consentKey(ext.slug, ext.config.mcp)] === true;
}

export function grantConsent(ext: LoadedExtension): void {
  if (!ext.config.mcp) return;
  const file = readConsents();
  file.granted[consentKey(ext.slug, ext.config.mcp)] = true;
  writeConsents(file);
}

export function revokeConsent(ext: LoadedExtension): void {
  if (!ext.config.mcp) return;
  const file = readConsents();
  delete file.granted[consentKey(ext.slug, ext.config.mcp)];
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
  for (const [name, value] of Object.entries(env)) {
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
    if (typeof value === 'string') {
      out[name] = value;
    } else {
      const stored = getSecret(ext.slug, value.secret);
      if (!stored) return null; // missing secret — can't spawn safely
      out[name] = stored;
    }
  }
  return out;
}

/* ---------- mapping ---------- */

function toSdkConfig(ext: LoadedExtension): SdkMcpServerConfig | null {
  const mcp = ext.config.mcp;
  if (!mcp) return null;

  if (mcp.transport === 'stdio') {
    const cfg: SdkStdioServerConfig = {
      type: 'stdio',
      command: mcp.command,
      args: mcp.args,
    };
    if (mcp.envFromBinding) {
      const env = resolveEnv(ext);
      if (env === null) return null;
      if (env) cfg.env = env;
    }
    return cfg;
  }

  return {
    type: mcp.transport,
    url: mcp.url,
    headers: mcp.headers,
  };
}

/**
 * Build the `mcpServers` value to pass to `query()`. Includes only enabled
 * mcp-backed extensions whose secrets are set and whose user-consent has
 * been granted.
 */
export function buildSdkMcpServers(): Record<string, SdkMcpServerConfig> {
  const all = loadAllExtensions();
  const out: Record<string, SdkMcpServerConfig> = {};
  for (const ext of all) {
    if (!isEnabled(ext.config)) continue;
    if (!ext.config.mcp) continue;
    if (!hasConsent(ext)) continue;
    const cfg = toSdkConfig(ext);
    if (cfg) out[ext.slug] = cfg;
  }
  return out;
}

/**
 * Same as `buildSdkMcpServers` but enumerates extensions that *would* be
 * included if their blockers were resolved — useful for diagnostics.
 */
export function listMcpExtensionsStatus(): Array<{
  slug: string;
  ok: boolean;
  reason?: 'disabled' | 'missing-secrets' | 'no-consent';
}> {
  return loadAllExtensions()
    .filter((e) => e.config.mcp)
    .map((e) => {
      if (!isEnabled(e.config)) return { slug: e.slug, ok: false, reason: 'disabled' as const };
      if (!hasConsent(e)) return { slug: e.slug, ok: false, reason: 'no-consent' as const };
      if (listMissingSecrets(e).length > 0)
        return { slug: e.slug, ok: false, reason: 'missing-secrets' as const };
      return { slug: e.slug, ok: true };
    });
}
