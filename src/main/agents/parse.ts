import matter from 'gray-matter';
import { z } from 'zod';
import type { AgentMetadata } from './types';
import {
  isValidModelId,
  getModelValidationError,
  SESSION_DEFAULT_MODEL,
} from '../../shared/agent-models';

/* ---------- validation result types ---------- */

export interface ValidationIssue {
  /** dotted path or filename — e.g. `name`, `frontmatter`, `AGENT.md`. */
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

/** Lowercase alphanumeric with hyphens. Single-char slugs allowed. */
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
    `Suggested: '${suggested || 'valid-agent-name'}'`,
  );
}

/* ---------- frontmatter schema ---------- */

export const AgentMetadataSchema = z
  .object({
    name: z.string().min(1, "Add a 'name' field with a human-readable title"),
    description: z.string().min(1, "Add a 'description' field explaining when to use this agent"),
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    maxTurns: z.number().int().min(1).optional(),
    permissionMode: z.enum(['plan', 'auto']).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    icon: z.string().optional(),
  })
  .passthrough();

/* ---------- parse + validate ---------- */

/**
 * Parse AGENT.md content into metadata + body. Returns null if frontmatter
 * is unparseable or required fields are missing.
 */
export function parseAgentFile(
  content: string,
): { metadata: AgentMetadata; body: string } | null {
  try {
    const parsed = matter(content);
    if (!parsed.data.name || !parsed.data.description) return null;

    const icon =
      typeof parsed.data.icon === 'string' && parsed.data.icon.trim().length > 0
        ? parsed.data.icon.trim()
        : undefined;

    const tools = Array.isArray(parsed.data.tools)
      ? (parsed.data.tools as string[])
      : undefined;

    return {
      metadata: {
        name: String(parsed.data.name),
        description: String(parsed.data.description),
        model: parsed.data.model ? String(parsed.data.model) : undefined,
        tools,
        maxTurns: parsed.data.maxTurns ? Number(parsed.data.maxTurns) : undefined,
        permissionMode: parsed.data.permissionMode
          ? String(parsed.data.permissionMode)
          : undefined,
        effort: parsed.data.effort ? String(parsed.data.effort) : undefined,
        icon,
      } as AgentMetadata,
      body: parsed.content,
    };
  } catch {
    return null;
  }
}

/**
 * Full AGENT.md content validation. Used by the validate button in the UI.
 *
 * @param markdownContent — full file content
 * @param slug — folder name (validated against slug regex)
 */
export function validateAgentContent(
  markdownContent: string,
  slug: string,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. slug shape
  const slugResult = validateSlug(slug);
  errors.push(...slugResult.errors);

  // 2. frontmatter parse
  let frontmatter: unknown;
  let body: string;
  try {
    const parsed = matter(markdownContent);
    frontmatter = parsed.data;
    body = parsed.content;
  } catch (e) {
    return invalidResult(
      'frontmatter',
      `Invalid YAML frontmatter: ${e instanceof Error ? e.message : 'Unknown error'}`,
      'Check YAML syntax in the frontmatter section',
    );
  }

  // 3. schema
  const metaResult = AgentMetadataSchema.safeParse(frontmatter);
  if (!metaResult.success) {
    for (const issue of metaResult.error.issues) {
      errors.push({
        path: issue.path.join('.') || 'AGENT.md',
        message: issue.message,
      });
    }
  }

  // 4. model ID validation
  if (metaResult.success && frontmatter && typeof frontmatter === 'object') {
    const fm = frontmatter as { model?: string };
    if (fm.model && !isValidModelId(fm.model)) {
      const errorMsg = getModelValidationError(fm.model);
      errors.push({
        path: 'model',
        message: errorMsg,
        suggestion: `Use a valid model ID or "${SESSION_DEFAULT_MODEL}" to inherit the session model. You can also omit the field entirely.`,
      });
    }
  }

  // 5. non-empty body (system prompt)
  if (!body || body.trim().length === 0) {
    errors.push({
      path: 'content',
      message: 'Agent system prompt is empty (nothing after frontmatter)',
      suggestion:
        'Add a system prompt after the frontmatter describing the agent\'s behavior and instructions',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { formatValidationResult } from '../validation/format';
