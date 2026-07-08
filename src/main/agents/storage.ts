import {existsSync, readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {basename, join} from 'node:path';
import type {LoadedAgent} from './types';
import {parseAgentFile} from './parse';
import {Paths, projectConfigRoot} from '../storage/paths';
import {invalidateAgentsPromptCache} from '../agent/system-prompt';

/* ---------- directory resolution ---------- */

/** User-tier agents directory: ~/.minimalist-agent/agents/ */
export function getAgentsDir(): string {
  return Paths.agentsDir();
}

/**
 * Project-tier agents directory: <cwd>/.minimalist-agent/agents/
 * Git-committable, team-shareable.
 */
export function getProjectAgentsDir(cwd: string): string {
  return join(projectConfigRoot(cwd), 'agents');
}

/* ---------- icon discovery ---------- */

const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

/** Find the first `icon.{ext}` file in an agent directory, if any. */
function findIconFile(agentDir: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const candidate = join(agentDir, `icon${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/* ---------- single-agent loader ---------- */

function loadAgentFromDir(slug: string, dir: string, source: import('./types').AgentSource): LoadedAgent | null {
  const agentDir = join(dir, slug);
  const agentFile = join(agentDir, 'AGENT.md');

  try {
    if (!existsSync(agentDir) || !statSync(agentDir).isDirectory()) return null;
  } catch {
    return null;
  }
  if (!existsSync(agentFile)) return null;

  let content: string;
  try {
    content = readFileSync(agentFile, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseAgentFile(content);
  if (!parsed) return null;

  return {
    slug,
    metadata: parsed.metadata,
    content: parsed.body,
    iconPath: findIconFile(agentDir),
    path: agentDir,
    source,
  };
}

/* ---------- cache ---------- */

// Keyed by canonical cache key: '' for user-only, cwd string when project included.
const cacheMap = new Map<string, { agents: LoadedAgent[]; ts: number }>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

/** Drop the cache. Call on file events / settings changes. */
export function invalidateAgentsCache(cwd?: string): void {
  if (cwd) {
    cacheMap.delete('');
    cacheMap.delete(cwd);
  } else {
    cacheMap.clear();
  }
  invalidateAgentsPromptCache(); // Also invalidate system prompt cache
}

/* ---------- directory-level loader ---------- */

function loadAgentsFromDirectory(
  dir: string,
  source: import('./types').AgentSource,
): LoadedAgent[] {
  if (!existsSync(dir)) return [];
  const agents: LoadedAgent[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const agent = loadAgentFromDir(name, dir, source);
    if (agent) agents.push(agent);
  }
  return agents;
}

/* ---------- public API ---------- */

/**
 * Load all agents merged from all available tiers:
 *   - user tier:    ~/.minimalist-agent/agents/
 *   - project tier: <cwd>/.minimalist-agent/agents/  (when cwd is provided)
 *
 * Project-tier agents take precedence over user-tier for same slug.
 * Cached per unique (user + cwd) combination with a 5-minute TTL.
 */
export function loadAllAgents(cwd?: string): LoadedAgent[] {
  const cacheKey = cwd ?? '';
  const now = Date.now();
  const cached = cacheMap.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL) return cached.agents;

  const userAgents = loadAgentsFromDirectory(getAgentsDir(), 'user');
  const projectAgents = cwd
    ? loadAgentsFromDirectory(getProjectAgentsDir(cwd), 'project')
    : [];

  // Merge: project overrides user for same slug.
  const bySlug = new Map<string, LoadedAgent>();
  for (const a of userAgents) bySlug.set(a.slug, a);
  for (const a of projectAgents) bySlug.set(a.slug, a); // project overrides

  const agents = Array.from(bySlug.values());
  cacheMap.set(cacheKey, { agents, ts: now });
  return agents;
}

/** O(1) lookup by slug, checking project tier first then user tier. */
export function loadAgentBySlug(slug: string, cwd?: string): LoadedAgent | null {
  if (cwd) {
    const proj = loadAgentFromDir(slug, getProjectAgentsDir(cwd), 'project');
    if (proj) return proj;
  }
  return loadAgentFromDir(slug, getAgentsDir(), 'user');
}

/** Delete an agent directory. Returns true if it existed and was removed. */
export function deleteAgent(slug: string): boolean {
  const agentDir = join(getAgentsDir(), slug);
  if (!existsSync(agentDir)) return false;
  try {
    rmSync(agentDir, { recursive: true });
    invalidateAgentsCache();
    return true;
  } catch {
    return false;
  }
}

/* ---------- file tree (for info pages) ---------- */

export type AgentFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: AgentFileNode[] };

/** Recursively scan an agent directory for the info-page file tree view. */
export function scanAgentDirectory(dir: string): AgentFileNode[] {
  if (!existsSync(dir)) return [];
  const out: AgentFileNode[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      out.push({
        kind: 'dir',
        name,
        path: full,
        children: scanAgentDirectory(full),
      });
    } else if (info.isFile()) {
      out.push({ kind: 'file', name, path: full, size: info.size });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export type { LoadedAgent } from './types';
export { basename };
