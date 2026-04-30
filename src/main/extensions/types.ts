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
 * No lifecycle FSM, no draft folder. Mirrors Skills' simplicity. The only
 * extra knob is `enabled` (default true) — relevant because MCP-backed
 * extensions spawn subprocesses we don't want running unless the user
 * actually wants them.
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
  /** Defaults to true. Disabled extensions are skipped from prompt + MCP spawn. */
  enabled?: boolean;
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

export function isEnabled(config: ExtensionConfig): boolean {
  return config.enabled !== false;
}

/* ---------- loaded record ---------- */

export type ExtensionScope = 'global';

export interface LoadedExtension {
  slug: string;
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
