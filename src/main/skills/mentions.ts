// Mention parsing for chat messages. The wire format is `@<token>` —
// `@slug` for skills, `@relative/path/file.ts` for files, and
// `@relative/path/dir/` (trailing slash) for folders. Plain text containing
// an `@` that doesn't resolve to a known skill / existing path is left
// untouched, so prose like "ping me @joe" stays as prose.
//
// Resolution rules (priority order):
//   1. token matches a known skill slug          → skill marker
//   2. token resolves to an existing directory   → folder marker
//   3. token resolves to an existing file         → file  marker
//   4. otherwise                                  → leave as literal text
//
// We resolve at the main-process level (filesystem access), so this file
// is not safe to import from the renderer.

import { existsSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

/** Detect a mention candidate at the start of input or after whitespace. */
const MENTION_RE = /(^|\s)@([\w./-]+)/g;

export interface ParsedMentions {
  /** Skill slugs that are present in `availableSkillSlugs`. */
  skills: string[];
  /** `@…` tokens that look like a skill mention but didn't match. */
  invalidSkills: string[];
  /** File paths (relative or absolute) that exist on disk under `cwd`. */
  files: string[];
  /** Folder paths that exist on disk under `cwd`. */
  folders: string[];
}

/**
 * Pull all mention tokens out of `text`. Skill matching is name-based
 * (caller passes in the installed slug list). File / folder matching
 * checks for actual existence under `cwd`.
 */
export function parseMentions(
  text: string,
  availableSkillSlugs: string[],
  cwd: string | undefined,
): ParsedMentions {
  const result: ParsedMentions = {
    skills: [],
    invalidSkills: [],
    files: [],
    folders: [],
  };

  for (const match of text.matchAll(MENTION_RE)) {
    const token = match[2]!.replace(/\/$/, '');
    if (availableSkillSlugs.includes(token)) {
      if (!result.skills.includes(token)) result.skills.push(token);
      continue;
    }

    const abs = absolutize(token, cwd);
    if (abs && existsSync(abs)) {
      try {
        const isDir = statSync(abs).isDirectory();
        if (isDir) {
          if (!result.folders.includes(token)) result.folders.push(token);
        } else if (!result.files.includes(token)) result.files.push(token);
        continue;
      } catch {
        /* fall through */
      }
    }

    // Looks like a slug shape but no match — record so the agent gets a
    // hint about the typo. We don't surface invalid file paths the same
    // way because a stray `@joe` in prose isn't a typo.
    if (looksLikeSkillSlug(token) && !result.invalidSkills.includes(token)) {
      result.invalidSkills.push(token);
    }
  }

  return result;
}

/**
 * Replace `@<token>` with semantic markers wherever a token resolves.
 * Tokens that don't match anything are left unchanged.
 *
 *   @weather              → [Mentioned skill: Weather (slug: weather)]
 *   @src/x.ts             → [Mentioned file: x.ts (at /abs/src/x.ts)]
 *   @src/components/      → [Mentioned folder: components (at /abs/src/components)]
 */
export function resolveMentions(
  text: string,
  ctx: { skillNames: Map<string, string>; cwd: string | undefined },
): string {
  return text.replace(MENTION_RE, (whole, leading: string, raw: string) => {
    const token = raw.replace(/\/$/, '');
    const skillName = ctx.skillNames.get(token);
    if (skillName !== undefined) {
      return `${leading}[Mentioned skill: ${skillName} (slug: ${token})]`;
    }
    const abs = absolutize(token, ctx.cwd);
    if (abs && existsSync(abs)) {
      try {
        const isDir = statSync(abs).isDirectory();
        const name = baseName(token);
        if (isDir) return `${leading}[Mentioned folder: ${name} (at ${abs})]`;
        return `${leading}[Mentioned file: ${name} (at ${abs})]`;
      } catch {
        /* fall through to literal */
      }
    }
    return whole;
  });
}

/* ---------- helpers ---------- */

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;

function looksLikeSkillSlug(token: string): boolean {
  return SKILL_SLUG_RE.test(token);
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function absolutize(token: string, cwd: string | undefined): string | null {
  if (!token) return null;
  if (token.startsWith('~')) return null; // home expansion not handled here
  if (isAbsolute(token)) return token;
  if (!cwd) return null;
  return join(cwd, token);
}
