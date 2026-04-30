import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllSkills } from './storage';
import { parseMentions, resolveMentions } from './mentions';

export interface SkillExtraction {
  /** Slug → absolute SKILL.md path for every resolvable skill mention. */
  skillPaths: Map<string, string>;
  /** Message text with mentions replaced by semantic markers. */
  cleanMessage: string;
  /** Slugs that the user mentioned but aren't installed. */
  missingSkills: string[];
}

/**
 * Parse skill mentions out of `message`, look them up, and return a
 * cleaned message with semantic markers in place of `[skill:slug]`.
 * Does NOT read the SKILL.md files — that's the model's job (enforced
 * by the directive prose returned from `formatSkillDirective`).
 */
export function extractSkillPaths(
  message: string,
  cwd?: string,
): SkillExtraction {
  const skills = loadAllSkills();
  const slugs = skills.map((s) => s.slug);
  const parsed = parseMentions(message, slugs, cwd);

  const skillPaths = new Map<string, string>();
  for (const slug of parsed.skills) {
    const skill = skills.find((s) => s.slug === slug);
    if (!skill) continue;
    const skillMd = join(skill.path, 'SKILL.md');
    if (existsSync(skillMd)) skillPaths.set(slug, skillMd);
  }

  // Replace mentions with semantic markers so sentence structure is preserved.
  const skillNames = new Map(skills.map((s) => [s.slug, s.metadata.name]));
  const resolved = resolveMentions(message, { skillNames, cwd }).trim();

  // If the user sent only skill mentions and no other text, give the
  // model a default directive to anchor its action.
  const cleanMessage =
    !resolved && skillPaths.size > 0
      ? 'Follow the skill instructions from the files listed above.'
      : resolved;

  return {
    skillPaths,
    cleanMessage,
    missingSkills: parsed.invalidSkills,
  };
}

/**
 * Build the prompt prefix telling the model to read SKILL.md files
 * before doing anything else. Empty string when there are no skills.
 */
export function formatSkillDirective(skillPaths: Map<string, string>): string {
  if (skillPaths.size === 0) return '';
  const list = [...skillPaths.entries()]
    .map(([slug, path]) => `- ${path} (skill: ${slug})`)
    .join('\n');
  return `Before proceeding with the user's request, you MUST read the following skill instruction files using the Read tool or \`cat\` via Bash:\n${list}\n\nDo not take any other action until you have read these files.`;
}
