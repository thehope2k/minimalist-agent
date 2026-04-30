// Parses the repo-root CHANGELOG.md (Keep a Changelog format) at build
// time via Vite's `?raw` import. The dialog renders the parsed structure
// directly — no markdown library needed.

import raw from '../../../../CHANGELOG.md?raw';

export interface ChangelogGroup {
  /** e.g. "Connections & Auth" — pulled from `**Bold**` headers. */
  title?: string;
  items: string[];
}

export interface ChangelogSection {
  /** "Added", "Fixed", "Changed", etc. — from `### Heading`. */
  heading: string;
  groups: ChangelogGroup[];
}

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  /** First non-empty paragraph line under the version heading, if any. */
  intro?: string;
  sections: ChangelogSection[];
}

export const CHANGELOG: ChangelogEntry[] = parse(raw);

const STORAGE_KEY = 'lastSeenChangelogVersion';

export function getLatestVersion(): string | null {
  return CHANGELOG[0]?.version ?? null;
}

export function getLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen(): void {
  const latest = getLatestVersion();
  if (!latest) return;
  try {
    localStorage.setItem(STORAGE_KEY, latest);
  } catch {
    /* localStorage unavailable — silent */
  }
}

export function hasUnseenChangelog(): boolean {
  const latest = getLatestVersion();
  if (!latest) return false;
  return getLastSeenVersion() !== latest;
}

/* ---------- parser ---------------------------------------------- */

/**
 * Tolerant Keep a Changelog parser. Recognised structure:
 *   ## [version] — date            (em dash or ascii dash)
 *   <intro paragraph>
 *   ### Section heading            (Added / Fixed / Changed / …)
 *   **Group title**                (optional sub-header)
 *   - bullet item
 *   - bullet item
 * Anything else becomes intro text on the current entry, or is ignored.
 */
function parse(src: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  let group: ChangelogGroup | null = null;

  const lines = src.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();
    if (line.startsWith('## ')) {
      const parsed = parseVersionHeading(line.slice(3));
      if (!parsed) continue;
      entry = { version: parsed.version, date: parsed.date, sections: [] };
      section = null;
      group = null;
      out.push(entry);
      continue;
    }
    if (!entry) continue;
    if (line.startsWith('### ')) {
      section = { heading: line.slice(4).trim(), groups: [] };
      entry.sections.push(section);
      group = null;
      continue;
    }
    const boldGroup = matchBoldGroup(line);
    if (boldGroup && section) {
      group = { title: boldGroup, items: [] };
      section.groups.push(group);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const item = line.slice(2).trim();
      if (!item) continue;
      if (!section) {
        // bullets before any ### — treat as a synthetic "Notes" section
        section = { heading: '', groups: [] };
        entry.sections.push(section);
      }
      if (!group) {
        group = { items: [] };
        section.groups.push(group);
      }
      group.items.push(item);
      continue;
    }
    // Plain paragraph text — capture as intro if we haven't entered a
    // section yet.
    if (!section && line.trim().length > 0 && !entry.intro) {
      entry.intro = line.trim();
    }
  }
  return out;
}

function parseVersionHeading(s: string): { version: string; date: string } | null {
  // Accepts:  [0.1.0] — 2026-05-03
  //           v0.2.0 - 2026-05-03 - Optional title (title goes to intro)
  //           0.3.0 (2026-05-03)
  const m =
    /^\[?v?([0-9][\w.+-]*)\]?\s*[—\-–(]\s*(\d{4}-\d{2}-\d{2})/.exec(s.trim());
  if (!m) return null;
  return { version: m[1], date: m[2] };
}

function matchBoldGroup(line: string): string | null {
  const m = /^\*\*(.+?)\*\*\s*$/.exec(line.trim());
  return m ? m[1] : null;
}
