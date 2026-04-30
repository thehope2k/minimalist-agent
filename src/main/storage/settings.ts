// Global AI defaults. Lightweight; one file, one schema version.

import { Paths } from './paths';
import { type FileSchema, load, save } from './json-store';

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Three-mode safety floor mapped onto the SDK's native `permissionMode`:
 *   - 'plan' → SDK `'plan'`  : agent researches + proposes, no mutations
 *   - 'ask'  → SDK `'default'` + canUseTool callback prompts the user
 *   - 'auto' → SDK `'bypassPermissions'` : full speed, no prompts
 */
export type PermissionMode = 'plan' | 'ask' | 'auto';

export interface AiSettings {
  defaultModel?: string;
  defaultThinking: ThinkingLevel;
  extendedContext?: boolean;
  /** Recently-used working directories, most-recent first. Capped at MAX. */
  recentFolders?: string[];
  /** Bound for tool-use loops per message. Defaults to DEFAULT_MAX_TURNS. */
  maxTurns?: number;
  /** Permission mode applied to brand-new sessions. Defaults to 'ask'. */
  defaultPermissionMode?: PermissionMode;
}

export const DEFAULT_MAX_TURNS = 50;
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'ask';

const DEFAULTS: AiSettings = {
  defaultThinking: 'medium',
  extendedContext: false,
  recentFolders: [],
  maxTurns: DEFAULT_MAX_TURNS,
  defaultPermissionMode: DEFAULT_PERMISSION_MODE,
};

const RECENT_MAX = 10;

const SCHEMA: FileSchema<AiSettings> = {
  path: Paths.settings(),
  currentVersion: 1,
  defaultValue: DEFAULTS,
  migrations: [],
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
