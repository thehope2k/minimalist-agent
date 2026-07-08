// Centralized resolution of every persistent path. All other modules go
// through here so the userData root is set in exactly one place.
//
// Two root tiers:
//
//   <userData>/  — machine-specific, sensitive data (Electron-managed)
//   ├── connections.json           ← LLM connections (no secrets)
//   ├── settings.json              ← AI defaults: model, thinking, extendedContext
//   ├── credentials.enc            ← Encrypted api keys / OAuth tokens
//   ├── backups/
//   ├── logs/
//   ├── sessions/
//   └── claude-config/
//
//   ~/.minimalist-agent/  — user-owned portable config (versionable, dotfile-syncable)
//   ├── agents/            ← global agent definitions  (migrated from userData/agents/)
//   ├── skills/            ← global skill definitions  (migrated from userData/skills/)
//   └── extensions/        ← global extensions         (migrated from userData/extensions/)
//
// Project-local config lives in .minimalist-agent/ inside the session CWD
// and is resolved at runtime (not managed by Paths).
//
// MIGRATION_BACKUP_RETENTION limits how many backup folders we keep around.

import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

let cachedRoot: string | null = null;

function root(): string {
  if (cachedRoot) return cachedRoot;
  cachedRoot = app.getPath('userData');
  mkdirSync(cachedRoot, { recursive: true });
  return cachedRoot;
}

/**
 * User-tier config root: ~/.minimalist-agent/
 * Portable, versionable, dotfile-syncable.
 * Stores agents, skills, extensions — NOT credentials or sessions.
 */
let cachedUserConfigRoot: string | null = null;

function userConfigRoot(): string {
  if (cachedUserConfigRoot) return cachedUserConfigRoot;
  cachedUserConfigRoot = join(homedir(), '.minimalist-agent');
  mkdirSync(cachedUserConfigRoot, { recursive: true });
  return cachedUserConfigRoot;
}

/**
 * Project-local config root within a given CWD: <cwd>/.minimalist-agent/
 * Git-committable, team-shareable. Resolved at runtime per session CWD.
 */
export function projectConfigRoot(cwd: string): string {
  return join(cwd, '.minimalist-agent');
}

/** Slug for the user config tier, used in pinned asset IDs. */
export const USER_CONFIG_TIER = 'user' as const;
/** Slug for the project config tier, used in pinned asset IDs. */
export const PROJECT_CONFIG_TIER = 'project' as const;

export const Paths = {
  root,
  connections: () => join(root(), 'connections.json'),
  settings: () => join(root(), 'settings.json'),
  projects: () => join(root(), 'projects.json'),
  credentials: () => join(root(), 'credentials.enc'),
  backupsDir: () => {
    const dir = join(root(), 'backups');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  sessionsDir: () => {
    const dir = join(root(), 'sessions');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  logsDir: () => {
    const dir = join(root(), 'logs');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  /** Default destination for the OTel JSONL file exporter. */
  tracesFile: () => join(root(), 'logs', 'traces.jsonl'),
  telemetry: () => join(root(), 'telemetry.json'),
  skillsDir: () => {
    const dir = join(userConfigRoot(), 'skills');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  extensionsDir: () => {
    const dir = join(userConfigRoot(), 'extensions');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  docsDir: () => {
    const dir = join(root(), 'docs');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  skillsReferenceDoc: () => join(root(), 'docs', 'skills.md'),
  extensionsReferenceDoc: () => join(root(), 'docs', 'extensions.md'),
  agentsDir: () => {
    const dir = join(userConfigRoot(), 'agents');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  extensionSecrets: () => join(root(), 'extension-secrets.enc'),
  extensionConsents: () => join(root(), 'extension-consents.json'),
  // Sandboxed CLAUDE_CONFIG_DIR for the agent SDK's native binary. We
  // write `.credentials.json` here per-turn so OAuth users don't need a
  // system-wide `claude /login`. Kept under userData so it survives
  // cache wipes and stays scoped to this app.
  claudeConfigDir: () => {
    const dir = join(root(), 'claude-config');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
} as const;

export const MIGRATION_BACKUP_RETENTION = 10;
