import matter from 'gray-matter';
import { z } from 'zod';
import type { AgentMetadata } from './types';
import {
  isValidModelId,
  getModelValidationError,
  SESSION_DEFAULT_MODEL,
} from '../../shared/agent-models';
import type { ValidationIssue, ValidationResult } from '../asset-tiers/validation';
import { invalidResult, validateSlug as validateSlugShared } from '../asset-tiers/validation';

export {
  type ValidationIssue,
  type ValidationResult,
  validResult,
  invalidResult,
  SLUG_REGEX,
} from '../asset-tiers/validation';

/** Agent-specific fallback suggestion text on top of the shared validator. */
export function validateSlug(slug: string): ValidationResult {
  return validateSlugShared(slug, 'valid-agent-name');
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
export async function validateAgentContent(
  markdownContent: string,
  slug: string,
): Promise<ValidationResult> {
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
    if (fm.model && !(await isValidModelId(fm.model))) {
      const errorMsg = await getModelValidationError(fm.model);
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
