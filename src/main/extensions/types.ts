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

export interface McpStdioTransport {
  transport: 'stdio';
  command: string;
  args?: string[];
  envFromBinding?: boolean;
}

export interface McpHttpTransport {
  transport: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type McpConfig = McpStdioTransport | McpHttpTransport;

export interface ExtensionPermissions {
  tools?: string[];
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

export function displayDescription(ext: LoadedExtension): string {
  return ext.guideFrontmatter.description || ext.config.description;
}

export function displayIcon(ext: LoadedExtension): string | undefined {
  return ext.guideFrontmatter.icon || ext.config.icon;
}
