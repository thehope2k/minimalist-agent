// User preferences — name, location, language, free-form notes, and whether
// to include the "Co-Authored-By" trailer in commits. Mirrors the
// comprehensive harness pattern: a structured block formatted into the
// system prompt's user-customization slot.
//
// Stored at <userData>/preferences.json. Keep this file separate from
// settings.json so the AI/Performance settings stay shaped identically to
// before and the "preferences" concept has its own lifecycle.

import { join } from 'node:path';
import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';

export interface UserPreferences {
  /** What to call the user. */
  name?: string;
  /** Free-text location, e.g. "Hanoi, Vietnam". */
  location?: string;
  /** Language code (ISO 639-1) to respond in. Defaults to 'en'. */
  language?: string;
  /** Free-form notes about the user — replaces the old appendSystemPrompt. */
  notes?: string;
  /** Include "Co-Authored-By: …" trailer instruction. Defaults to true. */
  includeCoAuthoredBy?: boolean;
}

const DEFAULTS: UserPreferences = {};

const SCHEMA: FileSchema<UserPreferences> = {
  path: join(Paths.root(), 'preferences.json'),
  currentVersion: 2,
  defaultValue: DEFAULTS,
  migrations: [
    // v0 → v1: no-op (initial version, unreachable — no file is ever
    // written below the version that existed when this store was introduced).
    (prev) => prev as UserPreferences,
    // v1 → v2: dropped the unused `timezone` field (the per-turn date/time
    // context already reflects the OS's live timezone every turn) and
    // replaced the structured {city, region, country} location with one
    // free-text field. Not worth preserving the old values — reset both.
    (prev) => {
      const { timezone: _timezone, location: _location, ...rest } =
        prev as UserPreferences & { timezone?: string };
      return rest as UserPreferences;
    },
  ],
};

export function loadPreferences(): UserPreferences {
  return { ...DEFAULTS, ...load(SCHEMA) };
}

export function savePreferences(prefs: UserPreferences): void {
  save(SCHEMA, prefs);
}

/** Whether to include the Co-Authored-By trailer. Defaults to true. */
export function getCoAuthorPreference(): boolean {
  return loadPreferences().includeCoAuthoredBy ?? true;
}

/** Curated list — keep small. Free-text via the `language` field is fine,
 *  but the UI Select uses this list. */
export const SUPPORTED_LANGUAGES: ReadonlyArray<{
  code: string;
  nativeName: string;
}> = [
  { code: 'en', nativeName: 'English' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'zh', nativeName: '中文' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'nl', nativeName: 'Nederlands' },
  { code: 'pl', nativeName: 'Polski' },
  { code: 'tr', nativeName: 'Türkçe' },
  { code: 'vi', nativeName: 'Tiếng Việt' },
];

function languageNativeName(code: string): string {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === code.toLowerCase())?.nativeName ??
    code
  );
}

/**
 * Format preferences as a `## User Preferences` block for the system prompt.
 *
 * Output shape (matches the comprehensive harness format verbatim):
 *
 *     ## User Preferences - User has explicitly set these preferences, so adhere to them
 *
 *     - Name: …
 *     - Location: …
 *     - Preferred language: …
 *
 *     ### Notes about this user
 *     {notes}
 *
 * Returns '' when the user hasn't set anything (empty preferences should
 * not produce a header).
 */
export function formatPreferencesForPrompt(): string {
  const prefs = loadPreferences();

  const langCode = (prefs.language ?? 'en').toLowerCase();
  const langName = languageNativeName(langCode);

  const hasAnything =
    !!prefs.name ||
    !!prefs.location ||
    !!prefs.notes ||
    langCode !== 'en';

  if (!hasAnything) return '';

  const lines: string[] = [
    '## User Preferences - User has explicitly set these preferences, so adhere to them',
    '',
  ];

  if (prefs.name) {
    lines.push(`- Name: ${prefs.name}`);
  }

  if (prefs.location) {
    lines.push(`- Location: ${prefs.location}`);
  }

  // Always include language — the model needs to know which language to
  // respond in, even when set to the default.
  lines.push(`- Preferred language: ${langName}`);

  if (prefs.notes && prefs.notes.trim()) {
    lines.push('', '### Notes about this user', prefs.notes.trim());
  }

  lines.push('');
  return lines.join('\n');
}
