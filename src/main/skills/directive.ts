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
  /** Absolute paths of mentioned files that exist on disk. */
  filePaths: string[];
  /** Absolute paths of mentioned folders that exist on disk. */
  folderPaths: string[];
  /** Message text with mentions replaced by semantic markers. */
  cleanMessage: string;
  /** Slugs that the user mentioned but aren't installed. */
  missingSkills: string[];
  /** File-path-shaped mentions that didn't resolve to anything on disk. */
  missingFiles: string[];
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

  // Absolutize resolved file / folder paths (tokens are relative to cwd).
  const filePaths: string[] = parsed.files.map((rel) =>
    cwd ? join(cwd, rel) : rel,
  );
  const folderPaths: string[] = parsed.folders.map((rel) =>
    cwd ? join(cwd, rel) : rel,
  );

  // Replace mentions with semantic markers so sentence structure is preserved.
  const skillNames = new Map(skills.map((s) => [s.slug, s.metadata.name]));
  const extensionNames = new Map(extensions.map((e) => [e.slug, displayName(e)]));
  const resolved = resolveMentions(message, {
    skillNames,
    extensionNames,
    cwd,
  }).trim();

  // If the user sent only skill / extension / file / folder mentions and no
  // other text, give the model a default directive to anchor its action.
  const onlyMentions =
    !resolved &&
    (skillPaths.size > 0 ||
      extensionGuidePaths.size > 0 ||
      filePaths.length > 0 ||
      folderPaths.length > 0);
  const cleanMessage = onlyMentions
    ? 'Follow the skill / extension instructions and review the mentioned files listed above.'
    : resolved;

  return {
    skillPaths,
    extensionGuidePaths,
    filePaths,
    folderPaths,
    cleanMessage,
    missingSkills: parsed.invalidSkills,
    missingFiles: parsed.invalidFiles,
  };
}

/**
 * Build the prompt prefix telling the model to read SKILL.md / guide.md
 * files and any user-mentioned files before doing anything else. Returns
 * an empty string when nothing was mentioned. Skills, extensions, and
 * plain file / folder mentions are listed together under one directive.
 */
export function formatSkillDirective(
  skillPaths: Map<string, string>,
  extensionGuidePaths: Map<string, string> = new Map(),
  mentionedFiles: string[] = [],
  mentionedFolders: string[] = [],
): string {
  if (
    skillPaths.size === 0 &&
    extensionGuidePaths.size === 0 &&
    mentionedFiles.length === 0 &&
    mentionedFolders.length === 0
  )
    return '';
  const lines: string[] = [];
  for (const [slug, path] of skillPaths) {
    lines.push(`- ${path} (skill: ${slug})`);
  }
  for (const [slug, path] of extensionGuidePaths) {
    lines.push(`- ${path} (extension: ${slug})`);
  }
  for (const path of mentionedFiles) {
    lines.push(`- ${path} (mentioned file)`);
  }
  for (const path of mentionedFolders) {
    lines.push(`- ${path} (mentioned folder — use ls or find to explore its contents)`);
  }
  return `Read the following files before proceeding:
${lines.join('\n')}`;
}
