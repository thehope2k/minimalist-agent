/**
 * Extension type system.
 *
 * An Extension is a user-facing capability the agent can use. Three variants
 * — guide-only, cli-bound, mcp-backed — share one on-disk shape:
 *
 *   <userData>/extensions/<slug>/
 *     extension.json     ← required, schema-validated config
 *     guide.md           ← required, gray-matter frontmatter + body
 *     icon.{png|svg|…}   ← optional
 *
 * Variant is implicit, derived from extension.json:
 *   - `mcp` block present  → mcp-backed
 *   - `env` block present  → cli-bound (or augments mcp-backed)
 *   - neither              → guide-only
 *
 * No lifecycle FSM. Presence in the folder = active. Remove to deactivate.
 */

/* ---------- frontmatter (guide.md) ---------- */

export interface ExtensionGuideFrontmatter {
  name?: string;
  description?: string;
  icon?: string;
}

/* ---------- extension.json ---------- */

/** Symbolic reference to a value in the secret store. Never inlines values. */
export interface SecretRef {
  secret: string;
}

export type EnvValue = string | SecretRef;

/**
 * How pi's native MCP integration exposes a server's tools to the model
 * (`direct`/`deferred`/`codemode`/`hidden`). This app defaults unset servers
 * to `direct` rather than pi's own `codemode` default, since it doesn't use
 * codemode.
 */
export type McpExposure = 'codemode' | 'deferred' | 'direct' | 'hidden';

interface McpTransportBase {
  description?: string;
  exposure?: McpExposure;
  /** Per-tool override, keyed by the server's own (unsanitized) tool name;
   * takes precedence over `exposure` for the listed tools. */
  toolExposure?: Record<string, McpExposure>;
}

export interface McpStdioTransport extends McpTransportBase {
  transport: 'stdio';
  command: string;
  args?: string[];
  envFromBinding?: boolean;
}

export interface McpHttpTransport extends McpTransportBase {
  transport: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  /**
   * Send the current token of a pi provider (`/login <provider>`) as the
   * bearer token, instead of interactive MCP OAuth — the only HTTP auth mode
   * this app can drive headlessly (no UI exists to complete an interactive
   * MCP OAuth browser flow).
   */
  auth?: { provider: string };
}

export type McpConfig = McpStdioTransport | McpHttpTransport;

export interface ExtensionPermissions {
  /**
   * MCP-backed extensions only: bare tool names (as exposed by the server,
   * without the `mcp__<slug>__` prefix) that the agent may NOT call. Absent
   * or empty means every tool the server exposes is callable. Ignored for
   * extensions with no `mcp` block — there's no separate tool surface to
   * restrict for those.
   */
  blockedTools?: string[];
  writeAccess?: boolean;
  networkHosts?: string[];
  commandPrefixes?: string[];
}

export interface ProvenanceSource {
  url: string;
  fetchedAt: string;
  note?: string;
}

export interface ExtensionProvenance {
  createdBy: 'agent' | 'user';
  createdAt?: string;
  sources?: ProvenanceSource[];
}

export interface ExtensionConfig {
  schemaVersion: 1;
  slug: string;
  name: string;
  description: string;
  version?: string;
  icon?: string;
  tags?: string[];
  env?: Record<string, EnvValue>;
  mcp?: McpConfig;
  permissions?: ExtensionPermissions;
  provenance?: ExtensionProvenance;
}

/* ---------- variant ---------- */

export type ExtensionVariant = 'guide-only' | 'cli-bound' | 'mcp-backed';

export function variantOf(config: ExtensionConfig): ExtensionVariant {
  if (config.mcp) return 'mcp-backed';
  if (config.env && Object.keys(config.env).length > 0) return 'cli-bound';
  return 'guide-only';
}

/**
 * Resolve a single env value for an extension.
 * - Literal string: used as-is for user-tier; `${VAR}` refs resolved from
 *   `process.env` for project-tier (silently skipped if unset).
 * - SecretRef: resolved from the keychain (caller provides `getSecretFn`).
 *   Returns null when the secret is required but missing (blocks MCP spawn).
 */
export function resolveEnvValue(
  value: EnvValue,
  scope: ExtensionScope,
  getSecretFn: (secretKey: string) => string | null | undefined,
): string | null | undefined {
  if (typeof value === 'string') {
    if (scope === 'project' && value.startsWith('${') && value.endsWith('}')) {
      const varName = value.slice(2, -1);
      return process.env[varName]; // undefined = skip silently
    }
    return value;
  }
  // SecretRef
  return getSecretFn(value.secret) ?? null; // null = missing, blocks spawn
}

/**
 * Whether this config declares any credential (a SecretRef, anywhere in
 * `env`). Independent of `mcp` — a cli-bound extension can carry secrets
 * too, and both cases deserve the same consent gate.
 */
export function hasSecretRefs(config: ExtensionConfig): boolean {
  if (!config.env) return false;
  return Object.values(config.env).some((v) => typeof v !== 'string');
}

/**
 * Whether this config is a big enough trust decision to require explicit
 * user consent before it can act: either it spawns/connects an MCP server
 * (runs external code), or it exports a credential into the agent's Bash
 * environment. A guide-only or credential-free cli-bound extension needs
 * neither.
 */
export function requiresConsent(config: ExtensionConfig): boolean {
  return !!config.mcp || hasSecretRefs(config);
}

const MCP_TOOL_PREFIX = 'mcp__';

/**
 * Mirrors pi's native MCP tool-name sanitizer (`extensions/mcp/tools.ts`):
 * every character outside `[A-Za-z0-9_]` becomes `_`. Needed to match a
 * qualified tool name back to an extension slug/tool whose original name
 * contains sanitized characters, e.g. slug `github-thehope2k` produces
 * tool names prefixed `mcp__github_thehope2k__`.
 */
export function normalizeMcpNamePart(part: string): string {
  return part.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Split a fully-qualified MCP tool name (`mcp__<slug>__<tool>`) into its
 * parts. Returns null for anything that isn't shaped like one — including
 * built-in tool names, which this must never mistake for MCP tools. The
 * returned `slug`/`tool` are whatever the caller sent (sanitized by pi's
 * native naming, or literal under the legacy bridge) — use `mcpSlugMatches`
 * to compare against a known extension slug.
 */
export function parseMcpToolName(fullToolName: string): { slug: string; tool: string } | null {
  if (!fullToolName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = fullToolName.slice(MCP_TOOL_PREFIX.length);
  const sep = rest.indexOf('__');
  if (sep === -1) return null;
  return { slug: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

/**
 * Whether a qualified tool name's slug segment (as returned by
 * `parseMcpToolName`) belongs to `extensionSlug`. Tries a literal match
 * first (the legacy bridge preserves the slug as-is) and falls back to
 * pi's sanitized form (native MCP replaces `-` and other non-`[A-Za-z0-9_]`
 * characters with `_`), so this works for both naming schemes during the
 * migration and after it.
 */
export function mcpSlugMatches(parsedSlug: string, extensionSlug: string): boolean {
  return parsedSlug === extensionSlug || parsedSlug === normalizeMcpNamePart(extensionSlug);
}

/** Whether `config` blocks `bareToolName` via `permissions.blockedTools`.
 * `bareToolName` may be sanitized (native MCP) or literal (legacy bridge);
 * both sides are compared through the same sanitizer so an authored entry
 * like `delete-issue` still matches a sanitized `delete_issue` call. */
export function isToolBlocked(config: ExtensionConfig, bareToolName: string): boolean {
  if (!config.mcp) return false;
  const blocked = config.permissions?.blockedTools;
  if (!blocked || blocked.length === 0) return false;
  const sanitized = normalizeMcpNamePart(bareToolName);
  return blocked.some((name) => name === bareToolName || normalizeMcpNamePart(name) === sanitized);
}

/* ---------- loaded record ---------- */

export type ExtensionScope = 'user' | 'project';

export interface LoadedExtension {
  slug: string;
  /** Tier this extension was loaded from. */
  scope: ExtensionScope;
  path: string;
  config: ExtensionConfig;
  guideFrontmatter: ExtensionGuideFrontmatter;
  guideBody: string;
  iconPath?: string;
  variant: ExtensionVariant;
  /** Absolute path to guide.md. */
  guidePath: string;
}

/* ---------- display helpers ---------- */

export function displayName(ext: LoadedExtension): string {
  return ext.guideFrontmatter.name || ext.config.name;
}
