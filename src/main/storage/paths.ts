// Centralized resolution of every persistent path. All other modules go
// through here so the userData root is set in exactly one place.
//
// Layout (under app.getPath('userData')):
//
//   <userData>/
//   ├── connections.json           ← LLM connections (no secrets)
//   ├── settings.json              ← AI defaults: model, thinking, extendedContext
//   ├── credentials.enc            ← Encrypted api keys / OAuth tokens
//   ├── backups/                   ← One subdir per migration run
//   │     └── 2026-04-30T11-25-00/
//   │           ├── connections.json
//   │           └── settings.json
//   └── sessions/                  ← (future) per-session message logs
//         └── {session-id}/
//               ├── session.json
//               └── messages.jsonl
//
// MIGRATION_BACKUP_RETENTION limits how many backup folders we keep around.

import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

let cachedRoot: string | null = null;

function root(): string {
  if (cachedRoot) return cachedRoot;
  cachedRoot = app.getPath('userData');
  mkdirSync(cachedRoot, { recursive: true });
  return cachedRoot;
}

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
  skillsDir: () => {
    const dir = join(root(), 'skills');
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  extensionsDir: () => {
    const dir = join(root(), 'extensions');
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
