// Shared slug validation for the three portable asset tiers (skills,
// extensions, agents). Each tier's own parse.ts re-exports these so its
// public API is unchanged — only the implementation is now shared.

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

/** Lowercase alphanumeric with hyphens. Single-char slugs allowed. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function validateSlug(
  slug: string,
  suggestionFallback = 'valid-slug-name',
): ValidationResult {
  if (SLUG_REGEX.test(slug)) return validResult();
  const suggested = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return invalidResult(
    'slug',
    'Slug must be lowercase alphanumeric with hyphens',
    `Suggested: '${suggested || suggestionFallback}'`,
  );
}
