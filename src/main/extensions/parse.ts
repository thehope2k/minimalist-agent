import matter from 'gray-matter';
import { z } from 'zod';
import type {
  ExtensionConfig,
  ExtensionGuideFrontmatter,
} from './types';

/* ---------- shared validation result types (mirrors skills/parse.ts) ---------- */

export interface ValidationIssue {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

export function invalidResult(
  path: string,
  message: string,
  suggestion?: string,
): ValidationResult {
  return {
    valid: false,
    errors: [{ path, message, suggestion }],
    warnings: [],
  };
}

/* ---------- slug ---------- */

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function validateSlug(slug: string): ValidationResult {
  if (SLUG_REGEX.test(slug)) return validResult();
  const suggested = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return invalidResult(
    'slug',
    'Slug must be lowercase alphanumeric with hyphens',
    `Suggested: '${suggested || 'valid-slug-name'}'`,
  );
}

/* ---------- zod schemas for extension.json ---------- */

const SecretRefSchema = z.object({ secret: z.string().min(1) });

const EnvValueSchema = z.union([z.string(), SecretRefSchema]);

const StdioTransportSchema = z.object({
  transport: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  envFromBinding: z.boolean().optional(),
});

const HttpTransportSchema = z.object({
  transport: z.union([z.literal('http'), z.literal('sse')]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

const McpConfigSchema = z.union([StdioTransportSchema, HttpTransportSchema]);

const PermissionsSchema = z.object({
  tools: z.array(z.string()).optional(),
  writeAccess: z.boolean().optional(),
  networkHosts: z.array(z.string()).optional(),
  commandPrefixes: z.array(z.string()).optional(),
});

const ProvenanceSchema = z.object({
  createdBy: z.union([z.literal('agent'), z.literal('user')]),
  createdAt: z.string().optional(),
  sources: z
    .array(
      z.object({
        url: z.string().url(),
        fetchedAt: z.string(),
        note: z.string().optional(),
      }),
    )
    .optional(),
});

export const ExtensionConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    slug: z.string().min(1),
    name: z.string().min(1, "Add a 'name' field with a human-readable title"),
    description: z
      .string()
      .min(1, "Add a 'description' field explaining the extension"),
    enabled: z.boolean().optional(),
    version: z.string().optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).optional(),

    env: z.record(z.string(), EnvValueSchema).optional(),
    mcp: McpConfigSchema.optional(),
    permissions: PermissionsSchema.optional(),
    provenance: ProvenanceSchema.optional(),
  })
  .passthrough();

/* ---------- guide.md frontmatter ---------- */

export const GuideFrontmatterSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })
  .passthrough();

/* ---------- parse functions ---------- */

/**
 * Parse and validate raw extension.json content. Returns null on failure.
 * Use `validateExtensionConfigContent` for a structured error report.
 */
export function parseExtensionConfig(raw: string): ExtensionConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ExtensionConfigSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data as ExtensionConfig;
}

/** Parse guide.md into frontmatter + body. Returns null on YAML failure. */
export function parseExtensionGuide(
  content: string,
): { frontmatter: ExtensionGuideFrontmatter; body: string } | null {
  try {
    const parsed = matter(content);
    const fm = GuideFrontmatterSchema.safeParse(parsed.data);
    if (!fm.success) return null;
    return {
      frontmatter: {
        name: fm.data.name,
        description: fm.data.description,
        icon: fm.data.icon,
      },
      body: parsed.content,
    };
  } catch {
    return null;
  }
}

/* ---------- structured validation (for the validate IPC handler) ---------- */

export function validateExtensionConfigContent(
  raw: string,
  slug: string,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. slug shape
  errors.push(...validateSlug(slug).errors);

  // 2. JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return invalidResult(
      'extension.json',
      `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
      'Check JSON syntax — trailing commas and unquoted keys are common culprits',
    );
  }

  // 3. schema
  const result = ExtensionConfigSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join('.') || 'extension.json',
        message: issue.message,
      });
    }
    return { valid: false, errors, warnings };
  }

  // 4. cross-field checks
  const cfg = result.data as ExtensionConfig;
  if (cfg.slug !== slug) {
    errors.push({
      path: 'slug',
      message: `extension.json slug ('${cfg.slug}') does not match folder name ('${slug}')`,
      suggestion: `Set "slug": "${slug}" or rename the folder`,
    });
  }

  if (cfg.mcp?.transport === 'stdio' && !cfg.mcp.command) {
    errors.push({ path: 'mcp.command', message: 'stdio transport needs a command' });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateExtensionGuideContent(raw: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  let body: string;
  try {
    const parsed = matter(raw);
    body = parsed.content;
    const fm = GuideFrontmatterSchema.safeParse(parsed.data);
    if (!fm.success) {
      for (const issue of fm.error.issues) {
        warnings.push({
          path: issue.path.join('.') || 'guide.md',
          message: issue.message,
        });
      }
    }
  } catch (e) {
    return invalidResult(
      'guide.md',
      `Invalid YAML frontmatter: ${e instanceof Error ? e.message : 'parse error'}`,
      'Check YAML syntax in the frontmatter section',
    );
  }

  if (!body || body.trim().length === 0) {
    errors.push({
      path: 'guide.md',
      message: 'Guide is empty (nothing after frontmatter)',
      suggestion: 'Document how the agent should use this extension',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { formatValidationResult } from '../validation/format';
