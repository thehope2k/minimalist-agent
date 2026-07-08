/** Skill metadata extracted from SKILL.md YAML frontmatter. */
export interface SkillMetadata {
  /** Display name for the skill. */
  name: string;
  /** Brief description shown in the skill list. */
  description: string;
  /** Optional file patterns that *could* trigger this skill (informational only in v1). */
  globs?: string[];
  /** Optional tools to always allow when the skill is active (informational only in v1). */
  alwaysAllow?: string[];
  /**
   * Optional icon — emoji or URL only.
   * - Emoji: rendered directly in UI (e.g. "🔧").
   * - URL: auto-downloaded to `icon.{ext}` next to SKILL.md on first load.
   */
  icon?: string;
}

/** Which directory tier a skill was loaded from. */
export type SkillSource = 'user' | 'project';

/** A loaded skill — frontmatter + body + on-disk paths. */
export interface LoadedSkill {
  /** Directory name (slug). */
  slug: string;
  /** Parsed metadata. */
  metadata: SkillMetadata;
  /** SKILL.md body (without frontmatter). */
  content: string;
  /** Absolute path to icon file if one exists locally. */
  iconPath?: string;
  /** Absolute path to the skill directory. */
  path: string;
  /** Tier the skill was loaded from. Single tier today. */
  source: SkillSource;
}
