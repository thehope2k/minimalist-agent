// Mention parsing for chat messages. The wire format is `@<token>` —
// `@slug` for skills, `@relative/path/file.ts` for files, and
// `@relative/path/dir/` (trailing slash) for folders. Plain text containing
// an `@` that doesn't resolve to a known skill / existing path is left
// untouched, so prose like "ping me @joe" stays as prose.
//
// Resolution rules (priority order):
//   1. token matches a known skill slug          → skill marker
//   2. token matches a known extension slug      → extension marker
//   3. token resolves to an existing directory   → folder marker
//   4. token resolves to an existing file        → file  marker
//   5. token looks like a file path but no match → invalidFiles (error)
//   6. token looks like a skill slug but no match→ invalidSkills (error)
//   7. otherwise                                  → leave as literal text
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
  /** Extension slugs that are present in `availableExtensionSlugs`. */
  extensions: string[];
  /** `@…` tokens that look like a slug mention but didn't match anything. */
  invalidSkills: string[];
  /** File paths (relative or absolute) that exist on disk under `cwd`. */
  files: string[];
  /** Folder paths that exist on disk under `cwd`. */
  folders: string[];
  /**
   * `@…` tokens that look like file paths (contain `/` or a dot-extension)
   * but didn't resolve to anything on disk. Surfaced so the backend can
   * emit a clear "file not found" error rather than silently passing the
   * raw `@token` to the model.
   */
  invalidFiles: string[];
}

/**
 * Pull all mention tokens out of `text`. Resolution priority on a slug-
 * shaped token: skill → extension → folder → file. Skills win over
 * extensions on slug collision (existing behavior; users should keep
 * unique slugs to avoid surprises). File / folder matching checks for
 * actual existence under `cwd`.
 */
export function parseMentions(
  text: string,
  availableSkillSlugs: string[],
  availableExtensionSlugs: string[],
  cwd: string | undefined,
): ParsedMentions {
  const result: ParsedMentions = {
    skills: [],
    extensions: [],
    invalidSkills: [],
    files: [],
    folders: [],
    invalidFiles: [],
  };

  for (const match of text.matchAll(MENTION_RE)) {
    const token = match[2]!.replace(/\/$/, '');
    if (availableSkillSlugs.includes(token)) {
      if (!result.skills.includes(token)) result.skills.push(token);
      continue;
    }
    if (availableExtensionSlugs.includes(token)) {
      if (!result.extensions.includes(token)) result.extensions.push(token);
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

    // File-path-shaped token that didn't resolve → flag for a clear error.
    // Slug-shaped token that didn't resolve → flag as a possible typo.
    // Plain prose (@joe) → leave untouched (not a typo, not a path).
    if (looksLikeFilePath(token) && !result.invalidFiles.includes(token)) {
      result.invalidFiles.push(token);
    } else if (looksLikeSkillSlug(token) && !result.invalidSkills.includes(token)) {
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
 *   @gh                   → [Mentioned extension: GitHub (slug: gh)]
 *   @src/x.ts             → [Mentioned file: x.ts (at /abs/src/x.ts)]
 *   @src/components/      → [Mentioned folder: components (at /abs/src/components)]
 *
 * Skill names take priority over extension names on slug collision —
 * matches `parseMentions`.
 */
export function resolveMentions(
  text: string,
  ctx: {
    skillNames: Map<string, string>;
    extensionNames: Map<string, string>;
    cwd: string | undefined;
  },
): string {
  return text.replace(MENTION_RE, (whole, leading: string, raw: string) => {
    const token = raw.replace(/\/$/, '');
    const skillName = ctx.skillNames.get(token);
    if (skillName !== undefined) {
      return `${leading}[Mentioned skill: ${skillName} (slug: ${token})]`;
    }
    const extensionName = ctx.extensionNames.get(token);
    if (extensionName !== undefined) {
      return `${leading}[Mentioned extension: ${extensionName} (slug: ${token})]`;
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

/**
 * Returns true when a token looks like the user intended a file reference
 * (contains a path separator or a dotted extension) rather than prose.
 * Used to distinguish "@docs/ROADMAP.md" (unresolved file path → error)
 * from "@joe" (prose mention → ignore).
 */
function looksLikeFilePath(token: string): boolean {
  return token.includes('/') || /\.[a-zA-Z0-9]{1,10}$/.test(token);
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
