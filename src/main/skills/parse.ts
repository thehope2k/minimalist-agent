import matter from 'gray-matter';
import { z } from 'zod';
import type { SkillMetadata } from './types';

/* ---------- validation result types ---------- */

export interface ValidationIssue {
  /** dotted path or filename — e.g. `name`, `frontmatter`, `SKILL.md`. */
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
    `Suggested: '${suggested || 'valid-slug-name'}'`,
  );
}

/* ---------- frontmatter schema ---------- */

export const SkillMetadataSchema = z
  .object({
    name: z.string().min(1, "Add a 'name' field with a human-readable title"),
    description: z
      .string()
      .min(1, "Add a 'description' field explaining what this skill does"),
    globs: z.array(z.string()).optional(),
    alwaysAllow: z.array(z.string()).optional(),
    icon: z.string().optional(),
  })
  .passthrough();

/* ---------- parse + validate ---------- */

/**
 * Parse SKILL.md content into metadata + body. Returns null if frontmatter
 * is unparseable or required fields are missing.
 */
export function parseSkillFile(
  content: string,
): { metadata: SkillMetadata; body: string } | null {
  try {
    const parsed = matter(content);
    if (!parsed.data.name || !parsed.data.description) return null;

    const icon =
      typeof parsed.data.icon === 'string' && parsed.data.icon.trim().length > 0
        ? parsed.data.icon.trim()
        : undefined;

    return {
      metadata: {
        name: String(parsed.data.name),
        description: String(parsed.data.description),
        globs: Array.isArray(parsed.data.globs)
          ? (parsed.data.globs as string[])
          : undefined,
        alwaysAllow: Array.isArray(parsed.data.alwaysAllow)
          ? (parsed.data.alwaysAllow as string[])
          : undefined,
        icon,
      },
      body: parsed.content,
    };
  } catch {
    return null;
  }
}

/**
 * Full SKILL.md content validation. Used by the validate button in the UI.
 *
 * @param markdownContent — full file content
 * @param slug — folder name (validated against slug regex)
 */
export function validateSkillContent(
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
  const metaResult = SkillMetadataSchema.safeParse(frontmatter);
  if (!metaResult.success) {
    for (const issue of metaResult.error.issues) {
      errors.push({
        path: issue.path.join('.') || 'SKILL.md',
        message: issue.message,
      });
    }
  }

  // 4. non-empty body
  if (!body || body.trim().length === 0) {
    errors.push({
      path: 'content',
      message: 'Skill content is empty (nothing after frontmatter)',
      suggestion:
        'Add instructions after the frontmatter describing what the skill should do',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  lines.push(result.valid ? '✓ Validation passed' : '✗ Validation failed');
  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const e of result.errors) {
      lines.push(`  - ${e.path}: ${e.message}`);
      if (e.suggestion) lines.push(`    → ${e.suggestion}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const w of result.warnings) lines.push(`  - ${w.path}: ${w.message}`);
  }
  return lines.join('\n');
}
