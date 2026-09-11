import matter from 'gray-matter';
import { z } from 'zod';
import type { SkillMetadata } from './types';
import type { ValidationIssue, ValidationResult } from '../asset-tiers/validation';
import { invalidResult, validateSlug } from '../asset-tiers/validation';

export {
  type ValidationIssue,
  type ValidationResult,
  validResult,
  invalidResult,
  SLUG_REGEX,
  validateSlug,
} from '../asset-tiers/validation';

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

export { formatValidationResult } from '../validation/format';
