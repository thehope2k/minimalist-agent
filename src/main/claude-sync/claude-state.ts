import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import type { ClaudeSyncKind } from '../../shared/electron-api';
import type { Manifest } from './plan';

const MANIFEST_FILE = '.minimalist-agent-sync.json';
const CLI_TIMEOUT_MS = 20_000;
const EXCLUDE_BEGIN = '# >>> minimalist-agent sync (managed, local only)';
const EXCLUDE_END = '# <<< minimalist-agent sync';

/** Your own Claude setup, or one project's `.claude/`. */
export type Target = { kind: 'user' } | { kind: 'project'; root: string };

export function userClaudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

export function claudeDirOf(target: Target): string {
  return target.kind === 'user' ? userClaudeDir() : join(target.root, '.claude');
}

function claudeJsonPath(): string {
  return process.env.CLAUDE_CONFIG_DIR
    ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')
    : join(homedir(), '.claude.json');
}

export function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function readTree(
  dir: string,
  skip: (rel: string) => boolean = () => false,
): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(dir)) return files;
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const rel = relative(dir, full);
      if (skip(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.set(rel, readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return files;
}

export function hashTree(files: Map<string, string>): string {
  return hashOf(
    [...files.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rel, text]) => `${rel}\n${text}`)
      .join('\n\0\n'),
  );
}

export const skillDir = (t: Target, name: string): string => join(claudeDirOf(t), 'skills', name);
export const agentFile = (t: Target, name: string): string =>
  join(claudeDirOf(t), 'agents', `${name}.md`);
// Projects get the uncommitted local settings, so synced env stays out of the repo.
const settingsPath = (t: Target): string =>
  join(claudeDirOf(t), t.kind === 'user' ? 'settings.json' : 'settings.local.json');

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.ma-tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

export interface ClaudeSnapshot {
  mcpServers: Set<string>;
  env: Record<string, string>;
  /** False when settings.json isn't valid JSON; MA won't touch it then. */
  settingsReadable: boolean;
}

function mcpServersOf(target: Target): unknown {
  const claudeJson = readJson(claudeJsonPath()) ?? {};
  if (target.kind === 'user') return claudeJson.mcpServers;
  // Local-scope servers live under the project's absolute path.
  const projects = claudeJson.projects as Record<string, { mcpServers?: unknown }> | undefined;
  return projects?.[resolve(target.root)]?.mcpServers;
}

export function readSnapshot(target: Target): ClaudeSnapshot {
  const servers = mcpServersOf(target);
  const settings = readJson(settingsPath(target));
  const env = settings?.env;
  return {
    mcpServers: new Set(servers && typeof servers === 'object' ? Object.keys(servers) : []),
    env:
      env && typeof env === 'object'
        ? Object.fromEntries(
            Object.entries(env as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : {},
    settingsReadable: settings !== null,
  };
}

export function existingHash(
  target: Target,
  snapshot: ClaudeSnapshot,
  kind: ClaudeSyncKind,
  name: string,
): string | undefined {
  switch (kind) {
    case 'skill': {
      const dir = skillDir(target, name);
      return existsSync(join(dir, 'SKILL.md')) ? hashTree(readTree(dir)) : undefined;
    }
    case 'agent': {
      const file = agentFile(target, name);
      return existsSync(file) ? hashOf(readFileSync(file, 'utf8')) : undefined;
    }
    case 'mcp':
      return snapshot.mcpServers.has(name) ? '' : undefined;
    case 'env':
      return name in snapshot.env ? hashOf(snapshot.env[name]) : undefined;
  }
}

export function setSettingsEnv(target: Target, changes: Record<string, string | null>): void {
  const path = settingsPath(target);
  const settings = readJson(path);
  if (settings === null) throw new Error(`${path} isn't valid JSON; left untouched.`);
  const env = { ...((settings.env as Record<string, string> | undefined) ?? {}) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  mkdirSync(claudeDirOf(target), { recursive: true });
  writeAtomic(path, `${JSON.stringify({ ...settings, env }, null, 2)}\n`);
}

/* ---------------------------- manifest ---------------------------- */

export function manifestPath(target: Target): string {
  return join(claudeDirOf(target), MANIFEST_FILE);
}

export function readManifest(target: Target): { entries: Manifest; excluded: string[] } {
  const data = readJson(manifestPath(target));
  const entries = data?.entries;
  const excluded = data?.excluded;
  return {
    entries: entries && typeof entries === 'object' ? (entries as Manifest) : {},
    excluded: Array.isArray(excluded)
      ? excluded.filter((k): k is string => typeof k === 'string')
      : [],
  };
}

export function writeManifest(target: Target, manifest: Manifest, excluded: string[]): void {
  mkdirSync(claudeDirOf(target), { recursive: true });
  const data = {
    version: 1,
    note: 'Written by Minimalist Agent "Sync to Claude". Lists what it created here, so it only ever updates or removes its own items, and what the user chose not to sync.',
    entries: manifest,
    excluded: [...new Set(excluded)].sort(),
  };
  writeAtomic(manifestPath(target), `${JSON.stringify(data, null, 2)}\n`);
}

/* --------------------------- git exclude --------------------------- */

/** `.git` can be a file pointing elsewhere (worktrees, submodules). */
function gitDirOf(root: string): string | null {
  const dotGit = join(root, '.git');
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
    return pointer ? resolve(root, pointer) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps MA's synced files out of `git status` via `.git/info/exclude`, which
 * is local to the clone and never committed. Rewrites only MA's own block.
 */
export function updateGitExclude(root: string, paths: string[]): void {
  const gitDir = gitDirOf(root);
  if (!gitDir) return;
  const file = join(gitDir, 'info', 'exclude');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const start = current.indexOf(EXCLUDE_BEGIN);
  const end = current.indexOf(EXCLUDE_END);
  const outside =
    start >= 0 && end > start
      ? current.slice(0, start) + current.slice(end + EXCLUDE_END.length).replace(/^\n/, '')
      : current;
  const block =
    paths.length > 0 ? [EXCLUDE_BEGIN, ...[...paths].sort(), EXCLUDE_END].join('\n') + '\n' : '';
  const base = outside.length > 0 && !outside.endsWith('\n') ? `${outside}\n` : outside;
  const next = base + block;
  if (next === current) return;
  mkdirSync(dirname(file), { recursive: true });
  writeAtomic(file, next);
}

/* ------------------------------- CLI ------------------------------- */

// A GUI-launched app doesn't inherit the login shell's PATH, so check the
// installer's usual locations before PATH.
const CLI_CANDIDATES = [
  join(homedir(), '.local', 'bin', 'claude'),
  join(homedir(), '.claude', 'local', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
];

export function findClaudeCli(): string | null {
  const fromPath = (process.env.PATH ?? '')
    .split(process.platform === 'win32' ? ';' : ':')
    .map((dir) => join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude'));
  for (const candidate of [...CLI_CANDIDATES, ...fromPath]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not here */
    }
  }
  return null;
}

/** `cwd` matters for local scope: Claude keys those servers by the working directory. */
export function runClaude(cli: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile(cli, args, { timeout: CLI_TIMEOUT_MS, cwd }, (err, _stdout, stderr) => {
      if (err)
        reject(
          new Error(
            String(stderr || err.message)
              .trim()
              .split('\n')[0],
          ),
        );
      else resolvePromise();
    });
  });
}
