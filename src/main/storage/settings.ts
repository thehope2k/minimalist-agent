// Global AI defaults. Lightweight; one file, one schema version.

import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Two-mode system mapped onto SDK permissions + collaboration:
 *   - 'plan' → SDK `'plan'`  : read-only, agent researches + proposes, no mutations
 *   - 'auto' → SDK `'default'` : full execution with autonomy-based collaboration
 */
export type PermissionMode = 'plan' | 'auto';

export interface AiSettings {
  defaultModel?: string;
  defaultThinking: ThinkingLevel;
  /** Recently-used working directories, most-recent first. Capped at MAX. */
  recentFolders?: string[];
  /** Bound for tool-use loops per message. Defaults to DEFAULT_MAX_TURNS. */
  maxTurns?: number;
  /** Permission mode applied to brand-new sessions. Defaults to 'auto'. */
  defaultPermissionMode?: PermissionMode;
  /** Default autonomy level (0-100) for new sessions in auto mode. Defaults to 50. */
  defaultAutonomyLevel?: number;
  /**
   * Filenames (case-insensitive) that MA treats as project context files and
   * lists in the system prompt for the AI to read each turn.
   * Defaults to ['agents.md', 'claude.md', 'copilot-instructions.md'].
   */
  contextFileNames?: string[];
  /**
   * Days after which archived sessions are auto-deleted on startup.
   * `null` disables auto-cleanup. Defaults to DEFAULT_SESSION_RETENTION_DAYS.
   */
  sessionRetentionDays?: number | null;
  /** Context compaction tuning for the Pi backend. Undefined fields fall
   *  back to the SDK's own defaults. */
  compactionSettings?: {
    enabled?: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
    /** Applies only to the manual "Compact now" trigger. */
    summarizerModel?: string;
  };
}

export const DEFAULT_CONTEXT_FILE_NAMES: readonly string[] = [
  'agents.md',
  'claude.md',
  'copilot-instructions.md', // GitHub Copilot Workspace standard
];
export const DEFAULT_MAX_TURNS = 50;
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'auto';

export const DEFAULT_COMPACTION_ENABLED = true;
export const DEFAULT_COMPACTION_RESERVE_TOKENS = 100_000;
export const DEFAULT_COMPACTION_KEEP_RECENT_TOKENS = 20000;

/** Default autonomy level (0-100) when in auto mode. */
export const DEFAULT_AUTONOMY_LEVEL = 50;
export const DEFAULT_SESSION_RETENTION_DAYS = 90;

const DEFAULTS: AiSettings = {
  defaultThinking: 'medium',
  recentFolders: [],
  maxTurns: DEFAULT_MAX_TURNS,
  defaultPermissionMode: DEFAULT_PERMISSION_MODE,
  defaultAutonomyLevel: DEFAULT_AUTONOMY_LEVEL,
  sessionRetentionDays: DEFAULT_SESSION_RETENTION_DAYS,
};

const RECENT_MAX = 10;

const SCHEMA: FileSchema<AiSettings> = {
  path: Paths.settings(),
  currentVersion: 3,
  defaultValue: DEFAULTS,
  migrations: [
    // v0 → v1: no-op (initial version)
    (prev) => prev as AiSettings,
    // v1 → v2: migrate 'ask' permission mode → 'auto'
    (prev) => {
      const settings = prev as AiSettings;
      if (settings.defaultPermissionMode === 'ask' as any) {
        return { ...settings, defaultPermissionMode: 'auto' as PermissionMode };
      }
      return settings;
    },
    // v2 → v3: adds sessionRetentionDays (optional field, no-op migration)
    (prev) => prev as AiSettings,
  ],
};

export function getSettings(): AiSettings {
  return { ...DEFAULTS, ...load(SCHEMA) };
}

export function saveSettings(settings: AiSettings): void {
  save(SCHEMA, settings);
}

/** Move `folder` to the front of `recentFolders`, dedupe, cap at MAX. */
export function pushRecentFolder(folder: string): AiSettings {
  const s = getSettings();
  const next = [folder, ...(s.recentFolders ?? []).filter((f) => f !== folder)].slice(
    0,
    RECENT_MAX,
  );
  const updated: AiSettings = { ...s, recentFolders: next };
  save(SCHEMA, updated);
  return updated;
}

/** Drop one entry from `recentFolders`. */
export function removeRecentFolder(folder: string): AiSettings {
  const s = getSettings();
  const updated: AiSettings = {
    ...s,
    recentFolders: (s.recentFolders ?? []).filter((f) => f !== folder),
  };
  save(SCHEMA, updated);
  return updated;
}
