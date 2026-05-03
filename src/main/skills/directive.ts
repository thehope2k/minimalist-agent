import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllSkills } from './storage';
import { loadAllExtensions } from '../extensions/storage';
import { displayName, isEnabled } from '../extensions/types';
import { parseMentions, resolveMentions } from './mentions';

export interface SkillExtraction {
  /** Slug → absolute SKILL.md path for every resolvable skill mention. */
  skillPaths: Map<string, string>;
  /** Slug → absolute guide.md path for every resolvable extension mention. */
  extensionGuidePaths: Map<string, string>;
  /** Message text with mentions replaced by semantic markers. */
  cleanMessage: string;
  /** Slugs that the user mentioned but aren't installed. */
  missingSkills: string[];
}

/**
 * Parse skill + extension mentions out of `message`, look them up, and
 * return a cleaned message with semantic markers in place of the raw
 * `@slug` tokens. Does NOT read the SKILL.md / guide.md files — that's
 * the model's job (enforced by the directive prose).
 */
export function extractSkillPaths(
  message: string,
  cwd?: string,
): SkillExtraction {
  const skills = loadAllSkills();
  const skillSlugs = skills.map((s) => s.slug);

  // Only enabled extensions can be mentioned — disabled ones can't act
  // anyway, so referring to them would just confuse the model.
  const extensions = loadAllExtensions().filter((e) => isEnabled(e.config));
  const extensionSlugs = extensions.map((e) => e.slug);

  const parsed = parseMentions(message, skillSlugs, extensionSlugs, cwd);

  const skillPaths = new Map<string, string>();
  for (const slug of parsed.skills) {
    const skill = skills.find((s) => s.slug === slug);
    if (!skill) continue;
    const skillMd = join(skill.path, 'SKILL.md');
    if (existsSync(skillMd)) skillPaths.set(slug, skillMd);
  }

  const extensionGuidePaths = new Map<string, string>();
  for (const slug of parsed.extensions) {
    const ext = extensions.find((e) => e.slug === slug);
    if (!ext) continue;
    if (existsSync(ext.guidePath)) extensionGuidePaths.set(slug, ext.guidePath);
  }

  // Replace mentions with semantic markers so sentence structure is preserved.
  const skillNames = new Map(skills.map((s) => [s.slug, s.metadata.name]));
  const extensionNames = new Map(extensions.map((e) => [e.slug, displayName(e)]));
  const resolved = resolveMentions(message, {
    skillNames,
    extensionNames,
    cwd,
  }).trim();

  // If the user sent only skill / extension mentions and no other text,
  // give the model a default directive to anchor its action.
  const onlyMentions =
    !resolved && (skillPaths.size > 0 || extensionGuidePaths.size > 0);
  const cleanMessage = onlyMentions
    ? 'Follow the skill / extension instructions from the files listed above.'
    : resolved;

  return {
    skillPaths,
    extensionGuidePaths,
    cleanMessage,
    missingSkills: parsed.invalidSkills,
  };
}

/**
 * Build the prompt prefix telling the model to read SKILL.md / guide.md
 * files before doing anything else. Empty string when nothing was
 * mentioned. Skill and extension references are listed together so the
 * model handles them with one directive.
 */
export function formatSkillDirective(
  skillPaths: Map<string, string>,
  extensionGuidePaths: Map<string, string> = new Map(),
): string {
  if (skillPaths.size === 0 && extensionGuidePaths.size === 0) return '';
  const lines: string[] = [];
  for (const [slug, path] of skillPaths) {
    lines.push(`- ${path} (skill: ${slug})`);
  }
  for (const [slug, path] of extensionGuidePaths) {
    lines.push(`- ${path} (extension: ${slug})`);
  }
  return `Before proceeding with the user's request, you MUST read the following instruction files using the Read tool or \`cat\` via Bash:\n${lines.join('\n')}\n\nDo not take any other action until you have read these files.`;
}
