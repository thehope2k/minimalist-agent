import type { LoadedExtension, LoadedSkill } from '@/lib/electron';
import { displayDescription, displayName } from '@/lib/extensions';

/**
 * Score a skill against a query string.
 * Higher score = better match. Returns 0 if no match.
 */
export function scoreSkill(skill: LoadedSkill, q: string): number {
  if (!q) return 1;
  const slug = skill.slug.toLowerCase();
  const name = skill.metadata.name.toLowerCase();
  const desc = skill.metadata.description.toLowerCase();
  if (slug.startsWith(q) || name.startsWith(q)) return 3;
  if (slug.includes(q) || name.includes(q)) return 2;
  if (desc.includes(q)) return 1;
  return 0;
}

/**
 * Score an extension against a query string.
 * Higher score = better match. Returns 0 if no match.
 */
export function scoreExtension(extension: LoadedExtension, q: string): number {
  if (!q) return 1;
  const slug = extension.slug.toLowerCase();
  const name = displayName(extension).toLowerCase();
  const desc = displayDescription(extension).toLowerCase();
  if (slug.startsWith(q) || name.startsWith(q)) return 3;
  if (slug.includes(q) || name.includes(q)) return 2;
  if (desc.includes(q)) return 1;
  return 0;
}
